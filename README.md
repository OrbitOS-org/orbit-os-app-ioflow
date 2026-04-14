# orbit-os-ioflow

Go services and web apps for **Orbit OS** that talk to device peripherals over **gRPC** (Gravity / `system_server`), using the official **[orbit-os-sdk-go](https://github.com/OrbitOS-org/orbit-os-sdk-go)** client.

The main deliverable here is **IOFlow**: a browser UI and HTTP API to control and test **GPIO**, **PWM**, **UART**, **I2C**, and **SPI** from a single place.

## Features

- **IOFlow** (`cmd/IOFlow`): embedded web assets, REST-style handlers under `/api/gpio/…`, TLS to the platform, optional **App Hub** registration so the portal can proxy `/ioflow` to the local HTTP server.
- **Shared internals** (`internal/`): gRPC dial helpers, GPIO/PWM/UART/I2C/SPI handlers, and settings-related clients built on the SDK.

## Requirements

- **Go** 1.25.4+ (see `go.mod`).
- **Git submodule**: `orbit-os-sdk-go` (vendored path; `go.mod` uses a `replace` to `./orbit-os-sdk-go`).

Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/OrbitOS-org/orbit-os-ioflow.git
cd orbit-os-ioflow
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

## Build

From the repository root:

```bash
go build -o ioflow ./cmd/IOFlow
```

Or run directly:

```bash
go run ./cmd/IOFlow
```

## Runtime flags (IOFlow)

| Flag | Default | Description |
|------|---------|-------------|
| `-port` | `9000` | HTTP listen port (binds to `127.0.0.1`) |
| `-host` | `192.168.5.131` | gRPC host (TCP) for system services |
| `-grpc-port` | `6000` | gRPC port |
| `-socket` | `/run/gravity/ipc/system_server.sock` | Unix socket path for `system_server` |

TLS client material is provided under `cmd/certs` (embedded). Adjust flags to match your device or development setup.

## App manifest

`cmd/IOFlow/metadata.json` follows the Orbit OS app manifest (package id, name, version, entry point, permissions). It is embedded at build time together with `templates/` and `static/`.

## SDK module path

This module depends on `github.com/OrbitOS-org/orbit-os-sdk-go/v26`, replaced locally by the submodule at `./orbit-os-sdk-go`. Do not point `require` at a fake module name; the import path must match the SDK’s `go.mod`.

## Project layout

```
cmd/IOFlow/       # IOFlow entrypoint, embeds UI + metadata
cmd/certs/        # Embedded TLS roots / client certs for gRPC
internal/handlers # HTTP API and page handlers
internal/settingsclient
internal/settingsdial
orbit-os-sdk-go/  # Git submodule (SDK)
```

## License

See the repository license file if present; otherwise follow your organization’s default policy.
