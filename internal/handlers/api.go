package handlers

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	orbitclient "orbit-os-sdk-go/client"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"orbit-os-peripherals-go/internal/settingsclient"
)

type APIHandler struct {
	client *settingsclient.Bundle
}

func NewAPIHandler(c *settingsclient.Bundle) *APIHandler {
	return &APIHandler{client: c}
}

func handleGRPCError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	st, ok := status.FromError(err)
	if ok {
		switch st.Code() {
		case codes.Unimplemented:
			http.Error(w, "Service not implemented on the gRPC server", http.StatusNotImplemented)
		case codes.Unavailable:
			http.Error(w, "gRPC service unavailable", http.StatusServiceUnavailable)
		case codes.NotFound:
			http.Error(w, "Resource not found", http.StatusNotFound)
		case codes.PermissionDenied:
			http.Error(w, "Permission denied", http.StatusForbidden)
		case codes.InvalidArgument:
			http.Error(w, "Invalid argument: "+st.Message(), http.StatusBadRequest)
		case codes.DeadlineExceeded:
			http.Error(w, "gRPC deadline exceeded", http.StatusGatewayTimeout)
		case codes.Canceled:
			http.Error(w, "gRPC canceled", http.StatusBadGateway)
		default:
			http.Error(w, st.Message(), http.StatusInternalServerError)
		}
	} else {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func parseGpioLevel(s string) orbitclient.GpioLevel {
	switch strings.ToUpper(s) {
	case "HIGH", "GPIO_LEVEL_HIGH":
		return orbitclient.GPIO_LEVEL_HIGH
	default:
		return orbitclient.GPIO_LEVEL_LOW
	}
}

func parseGpioDirection(s string) orbitclient.GpioDirection {
	switch strings.ToUpper(s) {
	case "IN", "GPIO_DIR_IN":
		return orbitclient.GPIO_DIR_IN
	default:
		return orbitclient.GPIO_DIR_OUT
	}
}

func parseUartParity(s string) orbitclient.UartParity {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "EVEN":
		return orbitclient.UartParityEven
	case "ODD":
		return orbitclient.UartParityOdd
	default:
		return orbitclient.UartParityNone
	}
}

func parseUartStopBits(s string) orbitclient.UartStopBits {
	if strings.TrimSpace(s) == "2" {
		return orbitclient.UartStopBits2
	}
	return orbitclient.UartStopBits1
}

func parseUartFlowControl(s string) orbitclient.UartFlowControl {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "HARDWARE", "RTSCTS", "RTS/CTS":
		return orbitclient.UartFlowHardware
	case "SOFTWARE", "XONXOFF":
		return orbitclient.UartFlowSoftware
	default:
		return orbitclient.UartFlowNone
	}
}

// HandleGpio serve GPIO, PWM, UART, I2C e SPI em /api/gpio/…
func (h *APIHandler) HandleGpio(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	path := strings.TrimPrefix(r.URL.Path, "/api/gpio/")
	method := r.Method
	switch {
	case path == "pins" && method == "GET":
		h.listGpioPins(w, r)
	case path == "level" && method == "GET":
		h.getGpioLevel(w, r)
	case path == "level" && method == "POST":
		h.setGpioLevel(w, r)
	case path == "direction" && method == "POST":
		h.setGpioDirection(w, r)
	case path == "pwm/pins" && method == "GET":
		h.listPwmPins(w, r)
	case path == "pwm" && method == "GET":
		h.getPwm(w, r)
	case path == "pwm" && method == "POST":
		h.setPwm(w, r)
	case path == "pwm/disable" && method == "POST":
		h.disablePwm(w, r)
	case path == "uart/ports" && method == "GET":
		h.listUartPorts(w, r)
	case path == "uart/open" && method == "POST":
		h.openUart(w, r)
	case path == "uart/close" && method == "POST":
		h.closeUart(w, r)
	case path == "uart/config" && method == "GET":
		h.getUartConfig(w, r)
	case path == "uart/write" && method == "POST":
		h.writeUart(w, r)
	case path == "uart/listen" && method == "GET":
		h.uartListen(w, r)
	case path == "i2c/buses" && method == "GET":
		h.listI2CBuses(w, r)
	case path == "i2c/scan" && method == "GET":
		h.scanI2CBus(w, r)
	case path == "i2c/config" && method == "GET":
		h.getI2CConfig(w, r)
	case path == "i2c/config" && method == "POST":
		h.setI2CConfig(w, r)
	case path == "i2c/transfer" && method == "POST":
		h.i2cTransfer(w, r)
	case path == "spi/devices" && method == "GET":
		h.listSpiDevices(w, r)
	case path == "spi/config" && method == "GET":
		h.getSpiConfig(w, r)
	case path == "spi/config" && method == "POST":
		h.setSpiConfig(w, r)
	case path == "spi/transfer" && method == "POST":
		h.spiTransfer(w, r)
	default:
		http.Error(w, "Not found", http.StatusNotFound)
	}
}

func (h *APIHandler) listGpioPins(w http.ResponseWriter, r *http.Request) {
	pins, err := h.client.GpioManager.ListPins()
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"pins": gpioPinsForAPI(pins)})
}

func (h *APIHandler) getGpioLevel(w http.ResponseWriter, r *http.Request) {
	pinName := r.URL.Query().Get("name")
	var pinNumber int32
	fmt.Sscan(r.URL.Query().Get("number"), &pinNumber)
	var pinChip int32
	fmt.Sscan(r.URL.Query().Get("chip"), &pinChip)
	pin := &orbitclient.GpioPin{Name: pinName, Number: pinNumber, ChipNumber: pinChip}
	state, err := h.client.GpioManager.GetLevel(pin)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]int32{"level": int32(state)})
}

func (h *APIHandler) setGpioLevel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PinName    string `json:"pinName"`
		PinNumber  int32  `json:"pinNumber"`
		ChipNumber int32  `json:"chipNumber"`
		Level      string `json:"level"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	pin := &orbitclient.GpioPin{Name: req.PinName, Number: req.PinNumber, ChipNumber: req.ChipNumber}
	level := parseGpioLevel(req.Level)
	if err := h.client.GpioManager.SetLevel(pin, level); err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) setGpioDirection(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PinName    string `json:"pinName"`
		PinNumber  int32  `json:"pinNumber"`
		ChipNumber int32  `json:"chipNumber"`
		Direction  string `json:"direction"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	pin := &orbitclient.GpioPin{Name: req.PinName, Number: req.PinNumber, ChipNumber: req.ChipNumber}
	direction := parseGpioDirection(req.Direction)
	if err := h.client.GpioManager.SetDirection(pin, direction); err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) listPwmPins(w http.ResponseWriter, r *http.Request) {
	pins, err := h.client.PwmManager.ListChannels()
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"pins": pwmChannelsForAPI(pins)})
}

func (h *APIHandler) getPwm(w http.ResponseWriter, r *http.Request) {
	pinName := r.URL.Query().Get("name")
	var pinNumber int32
	fmt.Sscan(r.URL.Query().Get("number"), &pinNumber)
	ch := &orbitclient.PwmChannel{Name: pinName, Channel: uint32(pinNumber)}
	state, err := h.client.PwmManager.GetProperties(ch)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(pwmPropertiesForAPI(state))
}

func (h *APIHandler) setPwm(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PinName     string  `json:"pinName"`
		PinNumber   int32   `json:"pinNumber"`
		DutyCycle   float64 `json:"dutyCycle"`
		FrequencyHz float64 `json:"frequencyHz"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ch := &orbitclient.PwmChannel{Name: req.PinName, Channel: uint32(req.PinNumber)}
	if err := h.client.PwmManager.SetPwm(ch, req.DutyCycle, req.FrequencyHz); err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) disablePwm(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PinName   string `json:"pinName"`
		PinNumber int32  `json:"pinNumber"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ch := &orbitclient.PwmChannel{Name: req.PinName, Channel: uint32(req.PinNumber)}
	if err := h.client.PwmManager.StopPwm(ch); err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) listUartPorts(w http.ResponseWriter, r *http.Request) {
	ports, err := h.client.UartManager.ListPorts()
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"ports": ports})
}

func (h *APIHandler) openUart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Port        string `json:"port"`
		Baudrate    int32  `json:"baudrate"`
		DataBits    int32  `json:"dataBits"`
		Parity      string `json:"parity"`
		StopBits    string `json:"stopBits"`
		FlowControl string `json:"flowControl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	cfg := orbitclient.UartConfig{
		Port:        req.Port,
		Baudrate:    int(req.Baudrate),
		DataBits:    int(req.DataBits),
		Parity:      parseUartParity(req.Parity),
		StopBits:    parseUartStopBits(req.StopBits),
		FlowControl: parseUartFlowControl(req.FlowControl),
	}
	if err := h.client.UartManager.Open(cfg); err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) closeUart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Port string `json:"port"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.client.UartManager.Close(req.Port); err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) getUartConfig(w http.ResponseWriter, r *http.Request) {
	port := r.URL.Query().Get("port")
	if port == "" {
		http.Error(w, "port query parameter required", http.StatusBadRequest)
		return
	}
	cfg, err := h.client.UartManager.GetConfig(port)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(cfg)
}

func (h *APIHandler) writeUart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Port string `json:"port"`
		Data string `json:"data"`
		Hex  bool   `json:"hex"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var payload []byte
	if req.Hex {
		s := strings.ToLower(strings.TrimSpace(req.Data))
		s = strings.ReplaceAll(s, "0x", "")
		s = strings.ReplaceAll(s, " ", "")
		for i := 0; i+1 < len(s); i += 2 {
			var b byte
			if _, err := fmt.Sscanf(s[i:i+2], "%02x", &b); err == nil {
				payload = append(payload, b)
			}
		}
	} else {
		payload = []byte(req.Data)
	}
	written, err := h.client.UartManager.Write(req.Port, payload)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"bytesWritten": written})
}

func (h *APIHandler) uartListen(w http.ResponseWriter, r *http.Request) {
	port := r.URL.Query().Get("port")
	if port == "" {
		http.Error(w, "port query parameter required", http.StatusBadRequest)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()
	ctx := r.Context()
	const maxChunkSize = 4096
	err := h.client.UartManager.Listen(ctx, port, maxChunkSize, func(data []byte) {
		enc := base64.StdEncoding.EncodeToString(data)
		payload, _ := json.Marshal(map[string]string{"data": enc})
		if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
			return
		}
		flusher.Flush()
	})
	if err != nil && ctx.Err() == nil {
		payload, _ := json.Marshal(map[string]string{"error": err.Error()})
		fmt.Fprintf(w, "data: %s\n\n", payload)
		flusher.Flush()
	}
}

func (h *APIHandler) listI2CBuses(w http.ResponseWriter, r *http.Request) {
	buses, err := h.client.I2CManager.ListBuses()
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"buses": buses})
}

func (h *APIHandler) scanI2CBus(w http.ResponseWriter, r *http.Request) {
	busStr := r.URL.Query().Get("bus")
	if busStr == "" {
		http.Error(w, "bus query parameter required", http.StatusBadRequest)
		return
	}
	var bus uint32
	if _, err := fmt.Sscanf(busStr, "%d", &bus); err != nil {
		http.Error(w, "invalid bus number", http.StatusBadRequest)
		return
	}
	addrs, err := h.client.I2CManager.ScanBus(bus)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"addresses": addrs})
}

func (h *APIHandler) getI2CConfig(w http.ResponseWriter, r *http.Request) {
	busStr := r.URL.Query().Get("bus")
	if busStr == "" {
		http.Error(w, "bus query parameter required", http.StatusBadRequest)
		return
	}
	var bus uint32
	if _, err := fmt.Sscanf(busStr, "%d", &bus); err != nil {
		http.Error(w, "invalid bus number", http.StatusBadRequest)
		return
	}
	cfg, err := h.client.I2CManager.GetConfig(bus)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(cfg)
}

func (h *APIHandler) setI2CConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Bus             uint32 `json:"bus"`
		ClockHz         uint32 `json:"clockHz"`
		TenBitAddr      bool   `json:"tenBitAddr"`
		ClockStretching bool   `json:"clockStretching"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	cfg := orbitclient.I2CConfig{
		Bus:             req.Bus,
		ClockHz:         req.ClockHz,
		TenBitAddr:      req.TenBitAddr,
		ClockStretching: req.ClockStretching,
	}
	if err := h.client.I2CManager.SetConfig(cfg); err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) i2cTransfer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Bus        uint32 `json:"bus"`
		Address    uint32 `json:"address"`
		Data       string `json:"data"`
		ReadLength uint32 `json:"readLength"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var data []byte
	var err error
	if req.Data != "" {
		data, err = parseFlexibleHex(req.Data)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	dataOut, err := h.client.I2CManager.Transfer(orbitclient.I2CTransferRequest{
		Bus: req.Bus, Address: req.Address, Data: data, ReadLength: req.ReadLength, Flags: 0,
	})
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	var hexParts []string
	for _, b := range dataOut {
		hexParts = append(hexParts, fmt.Sprintf("%02x", b))
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"data": strings.Join(hexParts, " ")})
}

func parseFlexibleHex(input string) ([]byte, error) {
	s := strings.TrimSpace(input)
	if s == "" {
		return nil, nil
	}
	var merged strings.Builder
	for _, part := range strings.Fields(s) {
		p := strings.TrimSpace(strings.ToLower(part))
		p = strings.TrimPrefix(p, "0x")
		for _, r := range p {
			switch {
			case r >= '0' && r <= '9', r >= 'a' && r <= 'f':
				merged.WriteRune(r)
			case r == ':' || r == '-' || r == ',' || r == ';':
				continue
			default:
				return nil, fmt.Errorf("invalid hex character %q in %q", r, part)
			}
		}
	}
	s = merged.String()
	if len(s)%2 == 1 {
		s = "0" + s
	}
	return hex.DecodeString(s)
}

func (h *APIHandler) listSpiDevices(w http.ResponseWriter, r *http.Request) {
	devices, err := h.client.SpiManager.ListDevices()
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"devices": devices})
}

func (h *APIHandler) getSpiConfig(w http.ResponseWriter, r *http.Request) {
	busStr := r.URL.Query().Get("bus")
	csStr := r.URL.Query().Get("chipSelect")
	if busStr == "" || csStr == "" {
		http.Error(w, "bus and chipSelect query parameters required", http.StatusBadRequest)
		return
	}
	var bus, cs uint32
	if _, err := fmt.Sscanf(busStr, "%d", &bus); err != nil {
		http.Error(w, "invalid bus number", http.StatusBadRequest)
		return
	}
	if _, err := fmt.Sscanf(csStr, "%d", &cs); err != nil {
		http.Error(w, "invalid chip select", http.StatusBadRequest)
		return
	}
	cfg, err := h.client.SpiManager.GetConfig(bus, cs)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(cfg)
}

func (h *APIHandler) setSpiConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Bus         uint32 `json:"bus"`
		ChipSelect  uint32 `json:"chipSelect"`
		MaxSpeedHz  uint32 `json:"maxSpeedHz"`
		BitsPerWord uint32 `json:"bitsPerWord"`
		LsbFirst    bool   `json:"lsbFirst"`
		Mode        uint32 `json:"mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	cfg := orbitclient.SpiConfig{
		Bus:         req.Bus,
		ChipSelect:  req.ChipSelect,
		MaxSpeedHz:  req.MaxSpeedHz,
		BitsPerWord: req.BitsPerWord,
		LSBFirst:    req.LsbFirst,
		Mode:        int(req.Mode),
	}
	if err := h.client.SpiManager.SetConfig(cfg); err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) spiTransfer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Bus        uint32 `json:"bus"`
		ChipSelect uint32 `json:"chipSelect"`
		DataOut    string `json:"dataOut"`
		ReadLength uint32 `json:"readLength"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var dataOut []byte
	var err error
	if req.DataOut != "" {
		dataOut, err = parseFlexibleHex(req.DataOut)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	dataIn, err := h.client.SpiManager.Transfer(req.Bus, req.ChipSelect, dataOut, req.ReadLength)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	var hexParts []string
	for _, b := range dataIn {
		hexParts = append(hexParts, fmt.Sprintf("%02x", b))
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"data": strings.Join(hexParts, " ")})
}
