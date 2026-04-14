package settingsdial

import (
	"fmt"
	"os"
	"path/filepath"
)

// MaterializeGRPCCerts writes ca/client under baseDir/certs/grpc/ so the SDK can find them via cwd.
func MaterializeGRPCCerts(baseDir string, ca, clientCert, clientKey []byte) error {
	d := filepath.Join(baseDir, "certs", "grpc")
	if err := os.MkdirAll(d, 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(d, "ca.crt"), ca, 0o600); err != nil {
		return err
	}
	if len(clientCert) > 0 {
		if err := os.WriteFile(filepath.Join(d, "client.crt"), clientCert, 0o600); err != nil {
			return err
		}
	}
	if len(clientKey) > 0 {
		if err := os.WriteFile(filepath.Join(d, "client.key"), clientKey, 0o600); err != nil {
			return err
		}
	}
	return nil
}

// WithWorkDir runs fn with working directory dir and restores the previous cwd.
func WithWorkDir(dir string, fn func() error) error {
	prev, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("getwd: %w", err)
	}
	if err := os.Chdir(dir); err != nil {
		return err
	}
	defer func() { _ = os.Chdir(prev) }()
	return fn()
}
