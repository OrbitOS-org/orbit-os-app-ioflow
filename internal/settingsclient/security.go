package settingsclient

import (
	"context"

	"orbit-os-sdk-go/api/common"
	systemv26 "orbit-os-sdk-go/api/system_service/v26"
	"google.golang.org/grpc"
)

// Security exposes SystemService RPCs not yet included on orbitclient.SystemManager.
type Security struct {
	client systemv26.SystemServiceClient
	ctx    context.Context
}

func newSecurity(cc *grpc.ClientConn, ctx context.Context) *Security {
	return &Security{client: systemv26.NewSystemServiceClient(cc), ctx: ctx}
}

func (s *Security) boolCall(fn func(context.Context, *common.Empty, ...grpc.CallOption) (*common.BooleanResponse, error)) (bool, error) {
	resp, err := fn(s.ctx, &common.Empty{})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}

func (s *Security) IsUntrustedAppsAllowed() (bool, error) {
	return s.boolCall(s.client.IsUntrustedAppsAllowed)
}

func (s *Security) AllowUntrustedApps() (bool, error) {
	return s.boolCall(s.client.AllowUntrustedApps)
}

func (s *Security) DisallowUntrustedApps() (bool, error) {
	return s.boolCall(s.client.DisallowUntrustedApps)
}

func (s *Security) IsRebootOnFailureEnabled() (bool, error) {
	return s.boolCall(s.client.IsRebootOnFailureEnabled)
}

func (s *Security) EnableRebootOnFailure() (bool, error) {
	return s.boolCall(s.client.EnableRebootOnFailure)
}

func (s *Security) DisableRebootOnFailure() (bool, error) {
	return s.boolCall(s.client.DisableRebootOnFailure)
}

func (s *Security) IsDevModeEnabled() (bool, error) {
	return s.boolCall(s.client.IsDevModeEnabled)
}

// EnableDevMode calls the EnableDeveMode RPC (proto name).
func (s *Security) EnableDevMode() (bool, error) {
	return s.boolCall(s.client.EnableDeveMode)
}

func (s *Security) DisableDevMode() (bool, error) {
	return s.boolCall(s.client.DisableDevMode)
}

func (s *Security) IsSSHServerEnabled() (bool, error) {
	return s.boolCall(s.client.IsSSHServerEnabled)
}

func (s *Security) EnableSSHServer() (bool, error) {
	return s.boolCall(s.client.EnableSSHServer)
}

func (s *Security) DisableSSHServer() (bool, error) {
	return s.boolCall(s.client.DisableSSHServer)
}
