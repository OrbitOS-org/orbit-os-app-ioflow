package certs

import (
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, dir, name, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestLoadFullDirectory(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "ca.crt", "ca")
	writeFile(t, dir, "client.crt", "cert")
	writeFile(t, dir, "client.key", "key")

	m, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !m.Complete() {
		t.Error("Complete() = false with all three files present")
	}
	if string(m.CACert) != "ca" || string(m.ClientCert) != "cert" || string(m.ClientKey) != "key" {
		t.Errorf("material = %+v", m)
	}
	if m.Dir != dir {
		t.Errorf("Dir = %q, want %q", m.Dir, dir)
	}
}

// A missing file is not an error: the certificates are only needed to reach a
// device over TCP, so the caller decides whether their absence matters.
func TestLoadEmptyDirectory(t *testing.T) {
	m, err := Load(t.TempDir())
	if err != nil {
		t.Fatalf("Load on an empty directory: %v", err)
	}
	if m.Complete() {
		t.Error("Complete() = true with no files")
	}
}

func TestLoadPartialDirectory(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "ca.crt", "ca")

	m, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if m.Complete() {
		t.Error("Complete() = true with only ca.crt")
	}
	if len(m.CACert) == 0 {
		t.Error("ca.crt was not read")
	}
}

func TestLoadMissingDirectory(t *testing.T) {
	m, err := Load(filepath.Join(t.TempDir(), "not-there"))
	if err != nil {
		t.Fatalf("Load on a directory that does not exist: %v", err)
	}
	if m.Complete() {
		t.Error("Complete() = true for a directory that does not exist")
	}
}
