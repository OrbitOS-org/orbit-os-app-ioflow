package handlers

import "orbit-os-sdk-go/metadata"

var RuntimeApp metadata.AppMetadata

func SetRuntimeApp(m metadata.AppMetadata) {
	RuntimeApp = m
}
