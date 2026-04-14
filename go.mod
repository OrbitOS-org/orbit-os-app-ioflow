module orbit-os-peripherals-go

go 1.25.4

require (
	golang.org/x/crypto v0.48.0
	google.golang.org/grpc v1.77.0
	orbit-os-sdk-go v0.0.0
)

require (
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/ncruces/go-strftime v1.0.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/net v0.51.0 // indirect
	golang.org/x/sys v0.42.0 // indirect
	golang.org/x/text v0.35.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20251022142026-3a174f9686a8 // indirect
	google.golang.org/protobuf v1.36.10 // indirect
	modernc.org/libc v1.70.0 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.11.0 // indirect
)

exclude (
	google.golang.org/genproto v0.0.0-20230110181048-76db0878b65f
	google.golang.org/genproto v0.0.0-20230227214838-9b19f0bdc514
)

replace orbit-os-sdk-go => ./orbit-os-sdk-go
