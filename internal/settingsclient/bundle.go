// Package settingsclient opens the app's connection to the Orbit OS platform: the
// local socket when the app runs on a device, or gRPC over TLS when it runs on a
// computer against a device in Developer Mode.
package settingsclient

import (
	"fmt"
	"os"

	orbitclient "github.com/OrbitOS-org/orbit-os-sdk-go/v26/client"

	orbitsettings "orbit-os-ioflow-go/internal/settingsdial"
)

// platformSocket matches orbitclient.NewUDSClient / NewClientAuto (client.unixSocket).
const platformSocket = "/run/gravity/ipc/system_server.sock"

// Same check as the SDK's client.socketExists, which the module does not export.
func platformSocketExists() bool {
	_, err := os.Stat(platformSocket)
	return err == nil
}

// Bundle is the SDK client, plus what has to be cleaned up when it closes.
type Bundle struct {
	*orbitclient.Client

	tempCertDir string
}

// Options for Connect.
type Options struct {
	// Host and GRPCPort are only used when there is no local socket, that is, when
	// developing against a device from a computer.
	Host     string
	GRPCPort int

	// CertsDir is where the TLS material below was read from; used only to point the
	// developer at the right folder when it is missing.
	CertsDir   string
	CACert     []byte
	ClientCert []byte
	ClientKey  []byte
}

// Connect sets the SDK up the same way as client.NewClientAuto: the local socket when
// it is there, otherwise TCP with TLS to Host:GRPCPort.
func Connect(o Options) (*Bundle, error) {
	if platformSocketExists() {
		sdk, err := orbitclient.NewUDSClient()
		if err != nil {
			return nil, fmt.Errorf("local socket: %w", err)
		}
		return &Bundle{Client: sdk}, nil
	}

	if o.Host == "" {
		return nil, fmt.Errorf("no local socket: to develop against a device, pass -host <DEVICE_IP> " +
			"with the device in Developer Mode")
	}

	if len(o.CACert) == 0 || len(o.ClientCert) == 0 || len(o.ClientKey) == 0 {
		dir := o.CertsDir
		if dir == "" {
			dir = "the project's certsDir"
		}
		return nil, fmt.Errorf("no TLS material in %s: run Add / Update SDK in Orbit Studio to set up "+
			"this project for your device", dir)
	}

	// The SDK looks for the certificates under the working directory, so they are
	// written to a temporary folder that Close removes.
	tmpDir, err := os.MkdirTemp("", "ioflow-grpc-certs-*")
	if err != nil {
		return nil, err
	}
	if err := orbitsettings.MaterializeGRPCCerts(tmpDir, o.CACert, o.ClientCert, o.ClientKey); err != nil {
		_ = os.RemoveAll(tmpDir)
		return nil, err
	}

	var sdk *orbitclient.Client
	err = orbitsettings.WithWorkDir(tmpDir, func() error {
		var e error
		sdk, e = orbitclient.NewTCPClient(o.Host, o.GRPCPort)
		return e
	})
	if err != nil {
		_ = os.RemoveAll(tmpDir)
		return nil, fmt.Errorf("TCP client: %w", err)
	}

	return &Bundle{Client: sdk, tempCertDir: tmpDir}, nil
}

// RegisterWebUI registers this app's page with the Launcher. It does nothing when the
// Launcher is unavailable.
func (b *Bundle) RegisterWebUI(addr, route string) error {
	if b == nil || b.AppHubManager == nil {
		return nil
	}
	return b.AppHubManager.RegisterWebUI(addr, route)
}

// UnregisterWebUI removes the registration on shutdown. It does nothing when the
// Launcher is unavailable.
func (b *Bundle) UnregisterWebUI() error {
	if b == nil || b.AppHubManager == nil {
		return nil
	}
	return b.AppHubManager.UnregisterService()
}

// Close removes the temporary certificates and closes the SDK client.
func (b *Bundle) Close() error {
	if b == nil {
		return nil
	}
	if b.tempCertDir != "" {
		_ = os.RemoveAll(b.tempCertDir)
	}
	if b.Client != nil {
		return b.Client.Close()
	}
	return nil
}
