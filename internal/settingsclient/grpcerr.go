package settingsclient

import (
	"fmt"

	"orbit-os-sdk-go/api/common"
)

func rpcErr(info *common.ErrorInfo) error {
	if info == nil || info.GetCode() == common.ErrorCode_ERROR_CODE_NONE {
		return nil
	}
	return fmt.Errorf("server error: %s (code %v)", info.GetMessage(), info.GetCode())
}
