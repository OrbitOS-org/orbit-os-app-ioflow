package handlers

import "github.com/OrbitOS-org/orbit-os-sdk-go/v26/metadata"

var RuntimeApp metadata.AppMetadata

func SetRuntimeApp(m metadata.AppMetadata) {
	RuntimeApp = m
}
