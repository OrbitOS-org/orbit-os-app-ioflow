package settingsclient

import (
	"fmt"

	"github.com/OrbitOS-org/orbit-os-sdk-go/v26/api/common"
)

func rpcErr(info *common.ErrorInfo) error {
	if info == nil || info.GetCode() == common.ErrorCode_ERROR_CODE_NONE {
		return nil
	}
	return fmt.Errorf("server error: %s (code %v)", info.GetMessage(), info.GetCode())
}
