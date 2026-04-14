package settingsclient

import (
	"context"

	"orbit-os-sdk-go/api/common"
	fwsvcv26 "orbit-os-sdk-go/api/firewall_service/v26"
	"google.golang.org/grpc"
)

type firewallExtra struct {
	client fwsvcv26.FirewallServiceClient
	ctx    context.Context
}

func newFirewallExtra(cc *grpc.ClientConn, ctx context.Context) *firewallExtra {
	return &firewallExtra{client: fwsvcv26.NewFirewallServiceClient(cc), ctx: ctx}
}

func (f *firewallExtra) ApplyFirewall() (bool, error) {
	resp, err := f.client.ApplyFirewall(f.ctx, &common.Empty{})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}
