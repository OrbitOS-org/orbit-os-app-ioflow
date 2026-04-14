package settingsclient

import (
	"context"

	"orbit-os-sdk-go/api/common"
	accountv26 "orbit-os-sdk-go/api/account_service/v26"
	"google.golang.org/grpc"
)

// AccountManager exposes AccountService.
type AccountManager struct {
	client accountv26.AccountServiceClient
	ctx    context.Context
}

func newAccountManager(cc *grpc.ClientConn, ctx context.Context) *AccountManager {
	return &AccountManager{client: accountv26.NewAccountServiceClient(cc), ctx: ctx}
}

func (a *AccountManager) GetAccountStatus() (*accountv26.AccountStatusResponse, error) {
	resp, err := a.client.GetAccountStatus(a.ctx, &common.Empty{})
	if err != nil {
		return nil, err
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return nil, err
	}
	return resp, nil
}

func (a *AccountManager) AddAccount(email, password string) (success bool, message string, err error) {
	resp, e := a.client.AddAccount(a.ctx, &accountv26.AddAccountRequest{Email: email, Password: password})
	if e != nil {
		return false, "", e
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, "", err
	}
	return resp.GetSuccess(), resp.GetMessage(), nil
}

func (a *AccountManager) RemoveAccount(password string) (success bool, message string, err error) {
	resp, e := a.client.RemoveAccount(a.ctx, &accountv26.RemoveAccountRequest{Password: password})
	if e != nil {
		return false, "", e
	}
	if err := rpcErr(resp.GetError()); err != nil {
		return false, "", err
	}
	return resp.GetSuccess(), resp.GetMessage(), nil
}
