package handlers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestHandleGRPCError(t *testing.T) {
	cases := []struct {
		code codes.Code
		want int
	}{
		{codes.Unimplemented, http.StatusNotImplemented},
		{codes.Unavailable, http.StatusServiceUnavailable},
		{codes.NotFound, http.StatusNotFound},
		{codes.PermissionDenied, http.StatusForbidden},
		{codes.InvalidArgument, http.StatusBadRequest},
		{codes.DeadlineExceeded, http.StatusGatewayTimeout},
		{codes.Canceled, http.StatusBadGateway},
		{codes.Internal, http.StatusInternalServerError},
	}

	for _, tc := range cases {
		rec := httptest.NewRecorder()
		handleGRPCError(rec, status.Error(tc.code, "no can do"))
		if rec.Code != tc.want {
			t.Errorf("%v: status %d, want %d", tc.code, rec.Code, tc.want)
		}
	}
}

func TestHandleGRPCErrorPlainError(t *testing.T) {
	rec := httptest.NewRecorder()
	handleGRPCError(rec, errors.New("the socket went away"))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status %d, want %d", rec.Code, http.StatusInternalServerError)
	}
	if !strings.Contains(rec.Body.String(), "the socket went away") {
		t.Errorf("body = %q, want the original message", rec.Body.String())
	}
}

func TestHandleGRPCErrorNilWritesNothing(t *testing.T) {
	rec := httptest.NewRecorder()
	handleGRPCError(rec, nil)
	if rec.Body.Len() != 0 {
		t.Errorf("body = %q, want nothing written", rec.Body.String())
	}
}

func TestGrpcMessage(t *testing.T) {
	if got := grpcMessage(nil); got != "" {
		t.Errorf("grpcMessage(nil) = %q, want empty", got)
	}
	if got := grpcMessage(status.Error(codes.NotFound, "no such pin")); got != "no such pin" {
		t.Errorf("grpcMessage = %q, want the message without the gRPC wrapping", got)
	}
	if got := grpcMessage(errors.New("plain")); got != "plain" {
		t.Errorf("grpcMessage = %q, want %q", got, "plain")
	}
}
