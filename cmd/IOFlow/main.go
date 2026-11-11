// IOFlow: web UI and HTTP API for GPIO, PWM, UART, I2C and SPI (Orbit OS manifest in metadata.json).
package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/OrbitOS-org/orbit-os-sdk-go/v26/logger"
	"github.com/OrbitOS-org/orbit-os-sdk-go/v26/metadata"

	"orbit-os-ioflow-go/cmd/certs"
	"orbit-os-ioflow-go/internal/handlers"
	"orbit-os-ioflow-go/internal/settingsclient"
)

const (
	logTag = "main"

	// Web interface ports are reserved to this range on Orbit OS.
	portMin = 50000
	portMax = 60000

	// defaultPort is the port IOFlow asks for first.
	defaultPort = 50090

	// webRoute is the path the Launcher serves the page at.
	webRoute = "/ioflow"
)

//go:embed metadata.json
var metadataJSON []byte

//go:embed templates
var templatesFS embed.FS

//go:embed static
var staticFS embed.FS

var appManifest = metadata.MustParseAppManifestJSON(metadataJSON)

func main() {
	port := flag.Int("port", defaultPort, fmt.Sprintf("preferred HTTP port, inside the reserved range %d-%d (rolls to the next free one)", portMin, portMax))
	host := flag.String("host", "", "device address for gRPC over TCP — development only, when running this app on your computer against a device in Developer Mode")
	grpcPort := flag.Int("grpc-port", 6000, "gRPC port (TCP fallback when the local socket is absent)")
	certsDir := flag.String("certs", certs.DefaultDir, "directory with the development TLS material (ca.crt, client.crt, client.key) — only used for the TCP fallback")
	flag.Parse()

	appMeta := metadata.Build(appManifest)
	handlers.SetRuntimeApp(appMeta)

	logger.Init(appMeta.Name, "INFO", true)
	logger.Infof(logTag, "--- %s ---", appMeta.Name)
	appManifest.PrintInfo()

	tlsMaterial, err := certs.Load(*certsDir)
	if err != nil {
		log.Fatalf("TLS material: %v", err)
	}

	var grpcBundle *settingsclient.Bundle
	retry := 5 * time.Second
	for {
		var err error
		grpcBundle, err = settingsclient.Connect(settingsclient.Options{
			Host:       *host,
			GRPCPort:   *grpcPort,
			CertsDir:   tlsMaterial.Dir,
			CACert:     tlsMaterial.CACert,
			ClientCert: tlsMaterial.ClientCert,
			ClientKey:  tlsMaterial.ClientKey,
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

	// Loopback only: the page is reached through the Launcher, behind the device login,
	// and never directly at http://<device-ip>:<port>.
	ln, httpPort, err := listenAndRegister(grpcBundle, *port, webRoute)
	if err != nil {
		log.Fatalf("web UI: %v", err)
	}
	logger.Infof(logTag, "HTTP listening on http://127.0.0.1:%d — open it at %s in the Launcher", httpPort, webRoute)

	go func() {
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
		<-ch
		logger.Infof(logTag, "shutting down…")
		if uerr := grpcBundle.UnregisterWebUI(); uerr != nil {
			logger.Warnf(logTag, "AppHub UnregisterWebUI: %v", uerr)
		}
		_ = grpcBundle.Close()
		_ = ln.Close()
		os.Exit(0)
	}()

	if err := http.Serve(ln, mux); err != nil {
		log.Fatal(err)
	}
}

// listenAndRegister takes a loopback port from the reserved range, starting at
// preferred, and registers the page with the Launcher. It rolls to the next port in
// the range when one is taken or the Launcher refuses it, and returns the listener
// to serve on together with the port it got.
func listenAndRegister(bundle *settingsclient.Bundle, preferred int, route string) (net.Listener, int, error) {
	if preferred < portMin || preferred > portMax {
		logger.Warnf(logTag, "port %d is outside the reserved range %d-%d — starting at %d", preferred, portMin, portMax, defaultPort)
		preferred = defaultPort
	}

	span := portMax - portMin + 1
	for i := 0; i < span; i++ {
		port := portMin + (preferred-portMin+i)%span
		addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))

		ln, err := net.Listen("tcp", addr)
		if err != nil {
			continue // port taken — roll to the next one
		}

		if bundle.AppHubManager == nil {
			logger.Warnf(logTag, "AppHub unavailable: serving on %s without a Launcher tile", addr)
			return ln, port, nil
		}

		if err := bundle.RegisterWebUI(addr, route); err != nil {
			logger.Warnf(logTag, "AppHub RegisterWebUI on %s: %v — rolling to the next port", addr, err)
			_ = ln.Close()
			continue // Launcher refused — roll to the next one
		}

		logger.Infof(logTag, "AppHub: registered at %s → %s", route, addr)
		return ln, port, nil
	}

	return nil, 0, fmt.Errorf("no free web UI port in %d-%d", portMin, portMax)
}
