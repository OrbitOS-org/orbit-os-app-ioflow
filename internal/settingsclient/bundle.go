package settingsclient

import (
	"context"
	"fmt"
	"os"

	orbitclient "github.com/OrbitOS-org/orbit-os-sdk-go/v26/client"
	"google.golang.org/grpc"
	orbitsettings "orbit-os-ioflow-go/internal/settingsdial"
)

// gravitySystemServerSocket matches orbitclient.NewUDSClient / NewClientAuto (orbit-os-sdk-go/client.unixSocket).
const gravitySystemServerSocket = "/run/gravity/ipc/system_server.sock"

// Same check as SDK client.socketExists (not exported from the module).
func gravitySystemServerSocketExists() bool {
	_, err := os.Stat(gravitySystemServerSocket)
	return err == nil
}

// Bundle wraps the SDK client plus extra services on a second gRPC channel (same endpoint).
type Bundle struct {
	*orbitclient.Client
	extrasConn  *grpc.ClientConn
	tempCertDir string
	cancelBg    context.CancelFunc

	TimeManager     *TimeManager
	CellularManager *CellularManager
	AccountManager  *AccountManager
	SensorManager   *SensorManager
	WiFiExtra       *WiFiExtra
	firewallExtra   *firewallExtra
	Security        *Security
}

// Options for Connect.
type Options struct {
	Host       string
	GRPCPort   int
	CACert     []byte
	ClientCert []byte
	ClientKey  []byte
}

// Connect sets up the SDK the same way as client.NewClientAuto: UDS if gravitySystemServerSocket exists,
// otherwise TCP+TLS to Host:GRPCPort. Also opens a second gRPC channel for services not on orbitclient.Client.
func Connect(o Options) (*Bundle, error) {
	ctx := context.Background()
	bgCtx, cancel := context.WithCancel(context.Background())

	var sdk *orbitclient.Client
	var extrasConn *grpc.ClientConn
	var tmpDir string

	if gravitySystemServerSocketExists() {
		var err error
		sdk, err = orbitclient.NewUDSClient()
		if err != nil {
			cancel()
			return nil, fmt.Errorf("UDS SDK: %w", err)
		}
		extrasConn, err = orbitsettings.DialUnix(ctx, gravitySystemServerSocket)
		if err != nil {
			_ = sdk.Close()
			cancel()
			return nil, fmt.Errorf("UDS extras: %w", err)
		}
		return finishBundle(sdk, extrasConn, "", cancel, bgCtx)
	}

	if len(o.CACert) == 0 {
		cancel()
		return nil, fmt.Errorf("embedded certs are empty (required for gRPC over TCP)")
	}

	tmpDir, err := os.MkdirTemp("", "orbit-settings-grpc-*")
	if err != nil {
		cancel()
		return nil, err
	}
	if err := orbitsettings.MaterializeGRPCCerts(tmpDir, o.CACert, o.ClientCert, o.ClientKey); err != nil {
		_ = os.RemoveAll(tmpDir)
		cancel()
		return nil, err
	}

	err = orbitsettings.WithWorkDir(tmpDir, func() error {
		var e error
		sdk, e = orbitclient.NewTCPClient(o.Host, o.GRPCPort)
		return e
	})
	if err != nil {
		_ = os.RemoveAll(tmpDir)
		cancel()
		return nil, fmt.Errorf("TCP SDK: %w", err)
	}

	creds, err := orbitsettings.TLSFromPEMs(o.CACert, o.ClientCert, o.ClientKey)
	if err != nil {
		_ = sdk.Close()
		_ = os.RemoveAll(tmpDir)
		cancel()
		return nil, err
	}
	addr := fmt.Sprintf("%s:%d", o.Host, o.GRPCPort)
	extrasConn, err = orbitsettings.DialTCP(ctx, addr, creds)
	if err != nil {
		_ = sdk.Close()
		_ = os.RemoveAll(tmpDir)
		cancel()
		return nil, fmt.Errorf("TCP extras: %w", err)
	}

	return finishBundle(sdk, extrasConn, tmpDir, cancel, bgCtx)
}

func finishBundle(sdkClient *orbitclient.Client, extrasConn *grpc.ClientConn, tmpDir string, cancel context.CancelFunc, rpcCtx context.Context) (*Bundle, error) {
	b := &Bundle{
		Client:      sdkClient,
		extrasConn:  extrasConn,
		tempCertDir: tmpDir,
		cancelBg:    cancel,
		TimeManager:     newTimeManager(extrasConn, rpcCtx),
		CellularManager: newCellularManager(extrasConn, rpcCtx),
		AccountManager:  newAccountManager(extrasConn, rpcCtx),
		SensorManager:   newSensorManager(extrasConn, rpcCtx),
		WiFiExtra:       newWiFiExtra(extrasConn, rpcCtx),
		firewallExtra:   newFirewallExtra(extrasConn, rpcCtx),
		Security:        newSecurity(extrasConn, rpcCtx),
	}
	return b, nil
}

// ApplyFirewall applies firewall rules (extra RPC).
func (b *Bundle) ApplyFirewall() (bool, error) {
	return b.firewallExtra.ApplyFirewall()
}

// RegisterWebUI registers this app's HTTP server with the AppHub portal.
// It is equivalent to AppHubManager.RegisterWebUI; returns nil if AppHub is unavailable.
func (b *Bundle) RegisterWebUI(addr, route string) error {
	if b == nil || b.AppHubManager == nil {
		return nil
	}
	return b.AppHubManager.RegisterWebUI(addr, route)
}

// UnregisterWebUI removes the AppHub registration (safe on shutdown). No-op if AppHub is unavailable.
func (b *Bundle) UnregisterWebUI() error {
	if b == nil || b.AppHubManager == nil {
		return nil
	}
	return b.AppHubManager.UnregisterService()
}

// Close closes extras, removes temp certs, and closes the SDK client.
func (b *Bundle) Close() error {
	if b.extrasConn != nil {
		_ = b.extrasConn.Close()
	}
	if b.tempCertDir != "" {
		_ = os.RemoveAll(b.tempCertDir)
	}
	if b.cancelBg != nil {
		b.cancelBg()
	}
	if b.Client != nil {
		return b.Client.Close()
	}
	return nil
}
