// Package certs expõe o material TLS gRPC partilhado (ficheiros em cmd/certs/grpc/).
package certs

import _ "embed"

//go:embed grpc/ca.crt
var CACert []byte

//go:embed grpc/client.crt
var ClientCert []byte

//go:embed grpc/client.key
var ClientKey []byte
