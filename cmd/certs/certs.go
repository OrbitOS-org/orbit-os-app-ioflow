// Package certs loads the TLS material used to reach the platform over TCP.
//
// The certificates are not part of the repository. Orbit Studio writes them to the
// project's certsDir (cmd/certs/grpc/) when you add a device, and they are only
// needed while developing against a device from your computer: on the device itself
// the app reaches the platform through the local socket, with no TLS material.
package certs

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// DefaultDir is the project's certsDir, where Orbit Studio writes the development
// TLS material.
const DefaultDir = "cmd/certs/grpc"

// Material is the client TLS material for a gRPC connection over TCP.
type Material struct {
	Dir        string
	CACert     []byte
	ClientCert []byte
	ClientKey  []byte
}

// Complete reports whether every file needed for a TCP connection was found.
func (m Material) Complete() bool {
	return len(m.CACert) > 0 && len(m.ClientCert) > 0 && len(m.ClientKey) > 0
}

// Load reads ca.crt, client.crt and client.key from dir. A file that is not there is
// left empty instead of failing: the caller needs them only to reach a device over
// TCP. Any other read error is returned.
func Load(dir string) (Material, error) {
	m := Material{Dir: dir}
	files := []struct {
		name string
		dst  *[]byte
	}{
		{"ca.crt", &m.CACert},
		{"client.crt", &m.ClientCert},
		{"client.key", &m.ClientKey},
	}
	for _, f := range files {
		path := filepath.Join(dir, f.name)
		b, err := os.ReadFile(path)
		switch {
		case err == nil:
			*f.dst = b
		case errors.Is(err, fs.ErrNotExist):
			// Optional: only needed for a TCP connection.
		default:
			return m, fmt.Errorf("read %s: %w", path, err)
		}
	}
	return m, nil
}
