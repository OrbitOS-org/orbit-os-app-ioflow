// Package settingsdial opens gRPC connections outside the orbit-os-sdk-go submodule.
package settingsdial

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

const grpcMaxMsgSize = 64 * 1024 * 1024

const dialTimeout = 15 * time.Second

// TLSFromPEMs builds client mTLS credentials from in-memory PEM (aligned with the SDK).
func TLSFromPEMs(caPEM, clientCertPEM, clientKeyPEM []byte) (credentials.TransportCredentials, error) {
	if len(caPEM) == 0 {
		return nil, fmt.Errorf("CA PEM is empty")
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("failed to parse CA PEM")
	}
	serverName := "system_server"
	tlsConfig := &tls.Config{
		RootCAs:            pool,
		MinVersion:         tls.VersionTLS12,
		ServerName:         serverName,
		InsecureSkipVerify: true,
	}
	tlsConfig.VerifyPeerCertificate = func(raw [][]byte, _ [][]*x509.Certificate) error {
		if len(raw) == 0 {
			return fmt.Errorf("no certificates from peer")
		}
		cert, err := x509.ParseCertificate(raw[0])
		if err != nil {
			return err
		}
		if _, err := cert.Verify(x509.VerifyOptions{Roots: pool}); err != nil {
			return fmt.Errorf("verification: %w", err)
		}
		return nil
	}
	if len(clientCertPEM) > 0 && len(clientKeyPEM) > 0 {
		kp, err := tls.X509KeyPair(clientCertPEM, clientKeyPEM)
		if err != nil {
			return nil, err
		}
		tlsConfig.Certificates = []tls.Certificate{kp}
	}
	return credentials.NewTLS(tlsConfig), nil
}

// DialTCP dials host:port with TLS (or insecure if creds==nil).
func DialTCP(ctx context.Context, address string, creds credentials.TransportCredentials) (*grpc.ClientConn, error) {
	ctx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()
	opts := []grpc.DialOption{
		grpc.WithBlock(),
		grpc.WithReturnConnectionError(),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallSendMsgSize(grpcMaxMsgSize),
			grpc.MaxCallRecvMsgSize(grpcMaxMsgSize),
		),
	}
	if creds != nil {
		opts = append(opts, grpc.WithTransportCredentials(creds))
	} else {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}
	return grpc.DialContext(ctx, address, opts...)
}

// DialUnix opens a Unix socket connection (local, no TLS — same as the SDK).
func DialUnix(ctx context.Context, socketPath string) (*grpc.ClientConn, error) {
	socketPath = strings.TrimSpace(socketPath)
	if socketPath == "" {
		return nil, fmt.Errorf("socket path is empty")
	}
	ctx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()
	addr := "unix://" + socketPath
	return grpc.DialContext(ctx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
		grpc.WithReturnConnectionError(),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallSendMsgSize(grpcMaxMsgSize),
			grpc.MaxCallRecvMsgSize(grpcMaxMsgSize),
		),
	)
}
