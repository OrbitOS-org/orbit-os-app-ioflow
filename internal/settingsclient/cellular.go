package settingsclient

import (
	"context"

	"orbit-os-sdk-go/api/common"
	cellularv26 "orbit-os-sdk-go/api/cellular_service/v26"
	"google.golang.org/grpc"
)

// CellularManager exposes CellularService via extrasConn.
type CellularManager struct {
	client cellularv26.CellularServiceClient
	ctx    context.Context
}

func newCellularManager(cc *grpc.ClientConn, ctx context.Context) *CellularManager {
	return &CellularManager{client: cellularv26.NewCellularServiceClient(cc), ctx: ctx}
}

func (c *CellularManager) ListCellularInterfaces() (*cellularv26.CellularInterfacesResponse, error) {
	resp, err := c.client.ListCellularInterfaces(c.ctx, &common.Empty{})
	if err != nil {
		return nil, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return nil, err
	}
	return resp, nil
}

func (c *CellularManager) GetCellularLinkProperties(iface string) (*cellularv26.CellularLinkProperties, error) {
	resp, err := c.client.GetCellularLinkProperties(c.ctx, &cellularv26.CellularInterfaceRequest{InterfaceName: iface})
	if err != nil {
		return nil, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return nil, err
	}
	return resp.GetProperties(), nil
}

func (c *CellularManager) Connect(iface string) (bool, error) {
	resp, err := c.client.Connect(c.ctx, &cellularv26.CellularInterfaceRequest{InterfaceName: iface})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}

func (c *CellularManager) Disconnect(iface string) (bool, error) {
	resp, err := c.client.Disconnect(c.ctx, &cellularv26.CellularInterfaceRequest{InterfaceName: iface})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}

func (c *CellularManager) SetCellularConfig(iface string, dhcp bool, ipv4, gateway string, dns []string) (bool, error) {
	resp, err := c.client.SetCellularConfig(c.ctx, &cellularv26.CellularConfig{
		InterfaceName: iface,
		DhcpEnable:    dhcp,
		Ipv4Address:   ipv4,
		Ipv4Gateway:   gateway,
		Ipv4Dns:       dns,
	})
	if err != nil {
		return false, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, err
	}
	return resp.GetValue(), nil
}
