package settingsclient

import (
	"context"
	"fmt"

	"orbit-os-sdk-go/api/common"
	wifiv26 "orbit-os-sdk-go/api/wifi_service/v26"
	"google.golang.org/grpc"
)

// WiFiExtra exposes Wi-Fi RPCs where the SDK wrapper does not match the HTTP API (StartAP, full SetAPConfig, SetWiFiMode).
type WiFiExtra struct {
	client wifiv26.WiFiServiceClient
	ctx    context.Context
}

func newWiFiExtra(cc *grpc.ClientConn, ctx context.Context) *WiFiExtra {
	return &WiFiExtra{client: wifiv26.NewWiFiServiceClient(cc), ctx: ctx}
}

func wifiErr(info *common.ErrorInfo) error {
	if info != nil && info.GetCode() != common.ErrorCode_ERROR_CODE_NONE {
		return fmt.Errorf("server error [%v]: %s", info.GetCode(), info.GetMessage())
	}
	return nil
}

// StartAP calls StartAP on the service directly.
func (w *WiFiExtra) StartAP(ifname string) (bool, error) {
	resp, err := w.client.StartAP(w.ctx, &wifiv26.WiFiInterfaceRequest{InterfaceName: ifname})
	if err != nil {
		return false, fmt.Errorf("StartAP(%s): %w", ifname, err)
	}
	if err := wifiErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}

// SetAPConfig sends full APConfig (incl. security, hidden, IPv4).
func (w *WiFiExtra) SetAPConfig(ifname, ssid, password, security, ipv4 string, channel int32, band string, hidden bool) (bool, error) {
	resp, err := w.client.SetAPConfig(w.ctx, &wifiv26.APConfig{
		InterfaceName: ifname,
		Ssid:          ssid,
		Password:      password,
		Security:      security,
		Ipv4Address:   ipv4,
		Channel:       channel,
		Band:          band,
		Hidden:        hidden,
	})
	if err != nil {
		return false, fmt.Errorf("SetAPConfig(%s): %w", ifname, err)
	}
	if err := wifiErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}

// SetWiFiMode sets the Wi-Fi mode (client, AP, etc.).
func (w *WiFiExtra) SetWiFiMode(ifname string, mode wifiv26.WiFiMode) (bool, error) {
	resp, err := w.client.SetWiFiMode(w.ctx, &wifiv26.SetWiFiModeRequest{
		InterfaceName: ifname,
		Mode:          mode,
	})
	if err != nil {
		return false, fmt.Errorf("SetWiFiMode(%s): %w", ifname, err)
	}
	if err := wifiErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}
