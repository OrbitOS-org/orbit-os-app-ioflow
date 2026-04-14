package settingsclient

import (
	"context"

	"github.com/OrbitOS-org/orbit-os-sdk-go/v26/api/common"
	timev26 "github.com/OrbitOS-org/orbit-os-sdk-go/v26/api/time_service/v26"
	"google.golang.org/grpc"
)

// TimeManager implements TimeService calls (extrasConn).
type TimeManager struct {
	client timev26.TimeServiceClient
	ctx    context.Context
}

func newTimeManager(cc *grpc.ClientConn, ctx context.Context) *TimeManager {
	return &TimeManager{client: timev26.NewTimeServiceClient(cc), ctx: ctx}
}

func (t *TimeManager) GetTimeSeconds() (int64, error) {
	resp, err := t.client.GetTimeSeconds(t.ctx, &common.Empty{})
	if err != nil {
		return 0, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return 0, err
	}
	return resp.GetTime(), nil
}

func (t *TimeManager) SetTimeSeconds(sec int64) (bool, error) {
	resp, err := t.client.SetTimeSeconds(t.ctx, &timev26.SetTimeRequest{Time: sec})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}

func (t *TimeManager) GetTimeMillis() (int64, error) {
	resp, err := t.client.GetTimeMillis(t.ctx, &common.Empty{})
	if err != nil {
		return 0, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return 0, err
	}
	return resp.GetTime(), nil
}

func (t *TimeManager) SetTimeMillis(ms int64) (bool, error) {
	resp, err := t.client.SetTimeMillis(t.ctx, &timev26.SetTimeRequest{Time: ms})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}

func (t *TimeManager) GetUptime() (int64, error) {
	resp, err := t.client.GetUptime(t.ctx, &common.Empty{})
	if err != nil {
		return 0, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return 0, err
	}
	return resp.GetUptimeSec(), nil // uptime in seconds
}

func (t *TimeManager) IsNTPSyncEnabled() (bool, error) {
	resp, err := t.client.IsNTPSyncEnabled(t.ctx, &common.Empty{})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}

func (t *TimeManager) EnableNTPSync() (bool, error) {
	resp, err := t.client.EnableNTPSync(t.ctx, &common.Empty{})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}

func (t *TimeManager) DisableNTPSync() (bool, error) {
	resp, err := t.client.DisableNTPSync(t.ctx, &common.Empty{})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}

// GetNTPConfig returns the NTP response (JSON fields aligned with the HTTP handler).
func (t *TimeManager) GetNTPConfig() (*timev26.NTPConfigResponse, error) {
	resp, err := t.client.GetNTPConfig(t.ctx, &common.Empty{})
	if err != nil {
		return nil, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return nil, err
	}
	return resp, nil
}

func (t *TimeManager) SetNTPConfig(enabled bool, servers []string, rtcSync bool) (bool, error) {
	resp, err := t.client.SetNTPConfig(t.ctx, &timev26.NTPConfigRequest{
		Enabled: enabled,
		Servers: servers,
		RtcSync: rtcSync,
	})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}
