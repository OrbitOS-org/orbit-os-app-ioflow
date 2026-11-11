module orbit-os-ioflow-go

go 1.25.4

require (
	github.com/OrbitOS-org/orbit-os-sdk-go/v26 v26.1.0
	google.golang.org/grpc v1.77.0
)

require (
	golang.org/x/net v0.51.0 // indirect
	golang.org/x/sys v0.42.0 // indirect
	golang.org/x/text v0.35.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20251022142026-3a174f9686a8 // indirect
	google.golang.org/protobuf v1.36.10 // indirect
)

exclude (
	google.golang.org/genproto v0.0.0-20230110181048-76db0878b65f
	google.golang.org/genproto v0.0.0-20230227214838-9b19f0bdc514
)

replace github.com/OrbitOS-org/orbit-os-sdk-go/v26 => ./orbit-os-sdk-go
