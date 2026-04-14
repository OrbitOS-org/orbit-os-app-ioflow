package settingsclient

import (
	"context"

	"github.com/OrbitOS-org/orbit-os-sdk-go/v26/api/common"
	sensorv26 "github.com/OrbitOS-org/orbit-os-sdk-go/v26/api/sensor_service/v26"
	"google.golang.org/grpc"
)

// SensorManager exposes SensorService.
type SensorManager struct {
	client sensorv26.SensorServiceClient
	ctx    context.Context
}

func newSensorManager(cc *grpc.ClientConn, ctx context.Context) *SensorManager {
	return &SensorManager{client: sensorv26.NewSensorServiceClient(cc), ctx: ctx}
}

func (s *SensorManager) GetCapabilities() (*sensorv26.CapabilitiesResponse, error) {
	resp, err := s.client.GetCapabilities(s.ctx, &common.Empty{})
	if err != nil {
		return nil, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return nil, err
	}
	return resp, nil
}
