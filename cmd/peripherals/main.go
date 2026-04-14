// Peripherals: UI e API HTTP para GPIO, PWM, UART, I2C e SPI (manifest OrbitOS em metadata.json).
package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	apphubv26 "orbit-os-sdk-go/api/app_hub_service/v26"
	"orbit-os-sdk-go/logger"
	"orbit-os-sdk-go/metadata"

	"orbit-os-peripherals-go/cmd/certs"
	"orbit-os-peripherals-go/internal/handlers"
	"orbit-os-peripherals-go/internal/settingsclient"
)

const logTag = "main"

//go:embed metadata.json
var metadataJSON []byte

//go:embed templates
var templatesFS embed.FS

//go:embed static
var staticFS embed.FS

var appManifest = metadata.MustParseAppManifestJSON(metadataJSON)

func main() {
	port := flag.String("port", "8081", "HTTP listen port")
	host := flag.String("host", "192.168.5.131", "gRPC host (TCP)")
	grpcPort := flag.Int("grpc-port", 6000, "gRPC port")
	socketPath := flag.String("socket", "/run/gravity/ipc/system_server.sock", "system_server Unix socket path")
	flag.Parse()

	appMeta := metadata.Build(appManifest)
	handlers.SetRuntimeApp(appMeta)

	logger.Init(appMeta.Name, "INFO", true)
	logger.Infof(logTag, "--- %s ---", appMeta.Name)
	appManifest.PrintInfo()

	var grpcBundle *settingsclient.Bundle
	retry := 5 * time.Second
	for {
		var err error
		grpcBundle, err = settingsclient.Connect(settingsclient.Options{
			Host:       *host,
			GRPCPort:   *grpcPort,
			SocketPath: *socketPath,
			CACert:     certs.CACert,
			ClientCert: certs.ClientCert,
			ClientKey:  certs.ClientKey,
		})
		if err == nil {
			break
		}
		logger.Warnf(logTag, "gRPC: %v — retrying in %v", err, retry)
		time.Sleep(retry)
	}
	defer grpcBundle.Close()
	logger.Infof(logTag, "gRPC client connected")

	apiHandler := handlers.NewAPIHandler(grpcBundle)
	webHandler := handlers.NewWebHandlerWithFS(templatesFS)

	mux := http.NewServeMux()
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/login" {
			http.NotFound(w, r)
			return
		}
		http.Redirect(w, r, "/", http.StatusFound)
	})

	staticContent, err := fs.Sub(staticFS, "static")
	if err != nil {
		log.Fatalf("static FS: %v", err)
	}
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticContent))))

	mux.HandleFunc("/api/gpio/", apiHandler.HandleGpio)

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		webHandler.HandleGpio(w, r)
	})
	mux.HandleFunc("/gpio", webHandler.HandleGpio)

	listenAddr := net.JoinHostPort("127.0.0.1", *port)
	logger.Infof(logTag, "HTTP listening on http://%s (portal /peripherals)", listenAddr)

	httpPort, err := strconv.Atoi(*port)
	if err != nil {
		log.Fatalf("invalid -port %q: %v", *port, err)
	}

	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		log.Fatalf("listen %s: %v", listenAddr, err)
	}

	if grpcBundle.AppHubManager != nil {
		regErr := grpcBundle.AppHubManager.RegisterService(&apphubv26.RegisterServiceRequest{
			Host:   "127.0.0.1",
			Port:   int32(httpPort),
			Routes: []*apphubv26.Route{{Path: "/peripherals"}},
			Health: &apphubv26.HealthCheck{
				Type: apphubv26.HealthCheckType_HEALTH_CHECK_TCP,
			},
		})
		if regErr != nil {
			logger.Warnf(logTag, "AppHub RegisterService: %v (portal tile unavailable)", regErr)
		} else {
			logger.Infof(logTag, "AppHub: registered at /peripherals → 127.0.0.1:%d", httpPort)
		}
	}

	go func() {
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
		<-ch
		logger.Infof(logTag, "shutting down…")
		_ = ln.Close()
		os.Exit(0)
	}()

	if err := http.Serve(ln, mux); err != nil {
		log.Fatal(err)
	}
}
