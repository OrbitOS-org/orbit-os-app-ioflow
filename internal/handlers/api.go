package handlers

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	orbitclient "github.com/OrbitOS-org/orbit-os-sdk-go/v26/client"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"orbit-os-ioflow-go/internal/settingsclient"
)

type spiKey struct{ bus, cs uint32 }

type APIHandler struct {
	client *settingsclient.Bundle

	uartMu    sync.Mutex
	uartPorts map[string]*orbitclient.UartPort
	uartHubs  map[string]*uartHub // one reader per open port, shared by every page

	i2cMu    sync.Mutex
	i2cBuses map[uint32]*orbitclient.I2CBus

	spiMu   sync.Mutex
	spiDevs map[spiKey]*orbitclient.SpiDevice

	// gpio keeps what does not need asking every second: the pin list (fixed
	// while the platform runs) and each pin's direction (changes only when set).
	gpio gpioCache
}

func NewAPIHandler(c *settingsclient.Bundle) *APIHandler {
	return &APIHandler{
		client:    c,
		uartPorts: make(map[string]*orbitclient.UartPort),
		uartHubs:  make(map[string]*uartHub),
		i2cBuses:  make(map[uint32]*orbitclient.I2CBus),
		spiDevs:   make(map[spiKey]*orbitclient.SpiDevice),
	}
}

// Close releases what the app holds on the device. Only UART ports are real open
// handles — an I2C bus or an SPI device is a configuration plus an address, with
// nothing to give back — but all three maps are cleared so a later connection
// starts from a clean state.
func (h *APIHandler) Close() error {
	h.gpio.reset()

	h.uartMu.Lock()
	ports := h.uartPorts
	h.uartPorts = make(map[string]*orbitclient.UartPort)
	hubs := h.uartHubs
	h.uartHubs = make(map[string]*uartHub)
	h.uartMu.Unlock()
	for _, hub := range hubs {
		hub.stop()
	}

	var firstErr error
	for name, port := range ports {
		if port == nil {
			continue
		}
		if err := port.Close(); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("close %s: %w", name, err)
		}
	}

	h.i2cMu.Lock()
	h.i2cBuses = make(map[uint32]*orbitclient.I2CBus)
	h.i2cMu.Unlock()

	h.spiMu.Lock()
	h.spiDevs = make(map[spiKey]*orbitclient.SpiDevice)
	h.spiMu.Unlock()

	return firstErr
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

// maxBodyBytes caps a JSON request body. Everything this API takes is small; the
// limit is there so a runaway client cannot make the app eat the device's memory.
const maxBodyBytes = 1 << 20 // 1 MiB

// decodeJSONBody reads the request body into dst and answers 400 when it cannot.
// It returns false when the caller should stop.
func decodeJSONBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return false
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return false
	}
	return true
}

// grpcMessage is the platform's message for an error, without the gRPC wrapping.
func grpcMessage(err error) string {
	if err == nil {
		return ""
	}
	if st, ok := status.FromError(err); ok {
		return st.Message()
	}
	return err.Error()
}

// queryInt32 reads a required integer query parameter.
func queryInt32(r *http.Request, name string) (int32, error) {
	raw := strings.TrimSpace(r.URL.Query().Get(name))
	if raw == "" {
		return 0, fmt.Errorf("%s query parameter required", name)
	}
	v, err := strconv.ParseInt(raw, 10, 32)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %q", name, raw)
	}
	return int32(v), nil
}

// queryUint32 reads a required unsigned integer query parameter.
func queryUint32(r *http.Request, name string) (uint32, error) {
	raw := strings.TrimSpace(r.URL.Query().Get(name))
	if raw == "" {
		return 0, fmt.Errorf("%s query parameter required", name)
	}
	v, err := strconv.ParseUint(raw, 10, 32)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %q", name, raw)
	}
	return uint32(v), nil
}

// parseGpioLevel rejects anything it does not know: a typo must not become a level.
func parseGpioLevel(s string) (orbitclient.GpioLevel, error) {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "HIGH", "GPIO_LEVEL_HIGH", "1":
		return orbitclient.GPIO_LEVEL_HIGH, nil
	case "LOW", "GPIO_LEVEL_LOW", "0":
		return orbitclient.GPIO_LEVEL_LOW, nil
	default:
		return 0, fmt.Errorf("invalid level %q: use HIGH or LOW", s)
	}
}

// parseGpioDirection rejects anything it does not know: a typo must not turn a pin
// into an output and start driving whatever is wired to it.
func parseGpioDirection(s string) (orbitclient.GpioDirection, error) {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "IN", "INPUT", "GPIO_DIR_IN":
		return orbitclient.GPIO_DIR_IN, nil
	case "OUT", "OUTPUT", "GPIO_DIR_OUT":
		return orbitclient.GPIO_DIR_OUT, nil
	default:
		return 0, fmt.Errorf("invalid direction %q: use IN or OUT", s)
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

// uartConfigJSON is the shape the page expects (sdk.UartConfig): camelCase keys, with parity, stopBits and flowControl as strings.
// encoding/json on orbitclient.UartConfig would emit "Port", "Parity" as ints — the UI expects baudrate, parity, etc.
type uartConfigJSON struct {
	Port        string `json:"port"`
	Baudrate    int    `json:"baudrate"`
	DataBits    int    `json:"dataBits"`
	Parity      string `json:"parity"`
	StopBits    string `json:"stopBits"`
	FlowControl string `json:"flowControl"`
}

func orbitUartConfigToJSON(cfg *orbitclient.UartConfig) uartConfigJSON {
	out := uartConfigJSON{
		Port:     cfg.Port,
		Baudrate: cfg.Baudrate,
		DataBits: cfg.DataBits,
	}
	switch cfg.Parity {
	case orbitclient.UartParityEven:
		out.Parity = "even"
	case orbitclient.UartParityOdd:
		out.Parity = "odd"
	default:
		out.Parity = "none"
	}
	if cfg.StopBits == orbitclient.UartStopBits2 {
		out.StopBits = "2"
	} else {
		out.StopBits = "1"
	}
	switch cfg.FlowControl {
	case orbitclient.UartFlowHardware:
		out.FlowControl = "rtscts"
	case orbitclient.UartFlowSoftware:
		out.FlowControl = "xonxoff"
	default:
		out.FlowControl = "none"
	}
	return out
}

// uartDefaultConfigJSON returns the same defaults as the web UI when the port is not open yet.
func uartDefaultConfigJSON(port string) uartConfigJSON {
	return uartConfigJSON{
		Port:        port,
		Baudrate:    115200,
		DataBits:    8,
		Parity:      "none",
		StopBits:    "1",
		FlowControl: "none",
	}
}

// uartErrMeansPortNotOpen matches GetUartConfig when the device has not opened the port (expected on first select).
func uartErrMeansPortNotOpen(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "not open") {
		return true
	}
	for e := err; e != nil; e = errors.Unwrap(e) {
		if st, ok := status.FromError(e); ok {
			switch st.Code() {
			case codes.FailedPrecondition, codes.NotFound:
				return true
			}
		}
	}
	return false
}

// HandleGpio serves GPIO, PWM, UART, I2C and SPI under /api/gpio/.
func (h *APIHandler) HandleGpio(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	path := strings.TrimPrefix(r.URL.Path, "/api/gpio/")
	method := r.Method
	switch {
	case path == "info" && method == "GET":
		h.boardInfo(w, r)
	case path == "states" && method == "GET":
		h.listGpioStates(w, r)
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
	pins, err := h.gpio.list(h.client.GpioManager.ListPins)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"pins": gpioPinsForAPI(pins)})
}

// listGpioStates reads every pin in one request. The page used to ask for one pin at
// a time, which cost an HTTP round trip (and two platform calls) per pin per second.
// Each refresh reads the levels; the pin list is kept, and the directions are read
// again only when they are older than directionMaxAge (the app updates the ones it
// sets itself), so a refresh costs one platform call per pin.
func (h *APIHandler) listGpioStates(w http.ResponseWriter, r *http.Request) {
	pins, err := h.gpio.list(h.client.GpioManager.ListPins)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	dirs, stale := h.gpio.directions()
	fresh := make(map[string]orbitclient.GpioDirection, len(pins))
	states := make([]gpioStateJSON, 0, len(pins))
	for _, p := range pins {
		if p == nil {
			continue
		}
		key := pinKey(p)
		state := gpioStateJSON{Name: p.Name, Number: p.Number, ChipNumber: p.ChipNumber}
		// One pin that cannot be read must not lose the whole table.
		level, err := h.client.GpioManager.GetLevel(p)
		if err != nil {
			state.Error = grpcMessage(err)
			states = append(states, state)
			continue
		}
		dir, known := dirs[key]
		if stale || !known {
			dir, err = h.client.GpioManager.GetDirection(p)
			if err != nil {
				state.Error = grpcMessage(err)
				states = append(states, state)
				continue
			}
			if !stale {
				h.gpio.setDirection(key, dir)
			}
		}
		fresh[key] = dir
		lvl, dirValue := int32(level), int32(dir)
		state.Level, state.Direction = &lvl, &dirValue
		states = append(states, state)
	}
	// A pin that failed is left out and asked again on the next refresh.
	if stale {
		h.gpio.storeDirections(fresh)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"states": states})
}

func (h *APIHandler) getGpioLevel(w http.ResponseWriter, r *http.Request) {
	pinNumber, err := queryInt32(r, "number")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	pinChip, err := queryInt32(r, "chip")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	pin := &orbitclient.GpioPin{Name: r.URL.Query().Get("name"), Number: pinNumber, ChipNumber: pinChip}
	level, err := h.client.GpioManager.GetLevel(pin)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	dir, err := h.client.GpioManager.GetDirection(pin)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(map[string]int32{
		"level":     int32(level),
		"direction": int32(dir),
	})
}

func (h *APIHandler) setGpioLevel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PinName    string `json:"pinName"`
		PinNumber  int32  `json:"pinNumber"`
		ChipNumber int32  `json:"chipNumber"`
		Level      string `json:"level"`
	}
	if !decodeJSONBody(w, r, &req) {
		return
	}
	level, err := parseGpioLevel(req.Level)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	pin := &orbitclient.GpioPin{Name: req.PinName, Number: req.PinNumber, ChipNumber: req.ChipNumber}
	err = h.client.GpioManager.SetLevel(pin, level)
	// Setting a level may change the direction on some boards: read it again.
	h.gpio.forget(pinKey(pin))
	if err != nil {
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
	if !decodeJSONBody(w, r, &req) {
		return
	}
	direction, err := parseGpioDirection(req.Direction)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	pin := &orbitclient.GpioPin{Name: req.PinName, Number: req.PinNumber, ChipNumber: req.ChipNumber}
	if err := h.client.GpioManager.SetDirection(pin, direction); err != nil {
		h.gpio.forget(pinKey(pin))
		handleGRPCError(w, err)
		return
	}
	h.gpio.setDirection(pinKey(pin), direction)
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
	pinNumber, err := queryUint32(r, "number")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ch := &orbitclient.PwmChannel{Name: r.URL.Query().Get("name"), Channel: pinNumber}
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
	if !decodeJSONBody(w, r, &req) {
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
	if !decodeJSONBody(w, r, &req) {
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
	if !decodeJSONBody(w, r, &req) {
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
	uartPort, err := h.client.UartManager.Open(cfg)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	h.uartMu.Lock()
	previous := h.uartPorts[req.Port]
	h.uartPorts[req.Port] = uartPort
	oldHub := h.uartHubs[req.Port]
	delete(h.uartHubs, req.Port)
	h.uartMu.Unlock()
	// The pages reading the old handle stop; they start again on the new one.
	if oldHub != nil {
		oldHub.stop()
		select { // a page that listens right after this must not meet the old stream
		case <-oldHub.ended:
		case <-time.After(prevWait):
		}
	}
	// Opening a port that was already open leaves the old handle behind on the device.
	if previous != nil {
		_ = previous.Close()
	}
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) closeUart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Port string `json:"port"`
	}
	if !decodeJSONBody(w, r, &req) {
		return
	}
	h.uartMu.Lock()
	uartPort, ok := h.uartPorts[req.Port]
	if ok {
		delete(h.uartPorts, req.Port)
	}
	hub := h.uartHubs[req.Port]
	delete(h.uartHubs, req.Port)
	h.uartMu.Unlock()
	if hub != nil {
		hub.stop()
	}
	if !ok {
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
		return
	}
	if err := uartPort.Close(); err != nil {
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
	h.uartMu.Lock()
	uartPort, ok := h.uartPorts[port]
	h.uartMu.Unlock()
	if !ok {
		json.NewEncoder(w).Encode(uartDefaultConfigJSON(port))
		return
	}
	cfg, err := uartPort.GetConfig()
	if err != nil {
		if uartErrMeansPortNotOpen(err) {
			json.NewEncoder(w).Encode(uartDefaultConfigJSON(port))
			return
		}
		handleGRPCError(w, err)
		return
	}
	json.NewEncoder(w).Encode(orbitUartConfigToJSON(cfg))
}

func (h *APIHandler) writeUart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Port string `json:"port"`
		Data string `json:"data"`
		Hex  bool   `json:"hex"`
	}
	if !decodeJSONBody(w, r, &req) {
		return
	}
	var payload []byte
	if req.Hex {
		// Same parser as the I2C and SPI transfers: it refuses what it cannot read,
		// instead of dropping the bytes it does not understand and writing the rest.
		var err error
		payload, err = parseFlexibleHex(req.Data)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if len(payload) == 0 {
			http.Error(w, "no bytes to write", http.StatusBadRequest)
			return
		}
	} else {
		payload = []byte(req.Data)
	}
	h.uartMu.Lock()
	uartPort, ok := h.uartPorts[req.Port]
	h.uartMu.Unlock()
	if !ok {
		http.Error(w, "port not open", http.StatusBadRequest)
		return
	}
	written, err := uartPort.Write(payload)
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
	// Everything that can fail has to fail before the stream headers go out: once
	// they are sent the status is 200 and an error can only arrive as stray text.
	hub, err := h.uartHub(port)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ch, ok := hub.subscribe()
	if !ok {
		http.Error(w, "port not open", http.StatusBadRequest)
		return
	}
	defer hub.unsubscribe(ch)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()
	for {
		select {
		case <-r.Context().Done():
			return // the page left
		case m, open := <-ch:
			if !open {
				return // the port was closed or reopened
			}
			var payload []byte
			if m.err != "" {
				payload, _ = json.Marshal(map[string]string{"error": m.err})
			} else {
				payload, _ = json.Marshal(map[string]string{"data": base64.StdEncoding.EncodeToString(m.data)})
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
				return // the page is gone: only its subscription ends
			}
			flusher.Flush()
		}
	}
}

// uartHub returns the reader of an open port, starting it for the first page.
func (h *APIHandler) uartHub(port string) (*uartHub, error) {
	h.uartMu.Lock()
	defer h.uartMu.Unlock()
	uartPort, ok := h.uartPorts[port]
	if !ok {
		return nil, errors.New("port not open")
	}
	prev := h.uartHubs[port]
	if prev != nil && prev.alive() {
		return prev, nil
	}
	hub := newUartHub(uartPort, prev, func(ended *uartHub) {
		h.uartMu.Lock()
		if h.uartHubs[port] == ended {
			delete(h.uartHubs, port)
		}
		h.uartMu.Unlock()
	})
	h.uartHubs[port] = hub
	return hub, nil
}

func (h *APIHandler) getOrOpenI2CBus(bus uint32) (*orbitclient.I2CBus, error) {
	h.i2cMu.Lock()
	b, ok := h.i2cBuses[bus]
	h.i2cMu.Unlock()
	if ok {
		return b, nil
	}
	b, err := h.client.I2CManager.Open(bus, 100000, false, false)
	if err != nil {
		return nil, err
	}
	h.i2cMu.Lock()
	h.i2cBuses[bus] = b
	h.i2cMu.Unlock()
	return b, nil
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
	bus, err := queryUint32(r, "bus")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	b, err := h.getOrOpenI2CBus(bus)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	addrs, err := b.Scan()
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	if addrs == nil {
		addrs = []uint32{} // an empty bus answers [], never null
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"addresses": addrs})
}

func (h *APIHandler) getI2CConfig(w http.ResponseWriter, r *http.Request) {
	bus, err := queryUint32(r, "bus")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	h.i2cMu.Lock()
	b, ok := h.i2cBuses[bus]
	h.i2cMu.Unlock()
	if !ok {
		http.Error(w, "bus not configured", http.StatusNotFound)
		return
	}
	cfg, err := b.GetConfig()
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
	if !decodeJSONBody(w, r, &req) {
		return
	}
	b, err := h.client.I2CManager.Open(req.Bus, req.ClockHz, req.TenBitAddr, req.ClockStretching)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	// Replacing the handle is enough: an I2C handle is a bus number, not a resource
	// the device holds open (I2CManager.Open only sets the configuration).
	h.i2cMu.Lock()
	h.i2cBuses[req.Bus] = b
	h.i2cMu.Unlock()
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) i2cTransfer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Bus        uint32 `json:"bus"`
		Address    uint32 `json:"address"`
		Data       string `json:"data"`
		ReadLength uint32 `json:"readLength"`
	}
	if !decodeJSONBody(w, r, &req) {
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
	bus, err := h.getOrOpenI2CBus(req.Bus)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	dataOut, err := bus.Transfer(req.Address, data, req.ReadLength, 0)
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

func (h *APIHandler) getOrOpenSpiDevice(bus, cs uint32) (*orbitclient.SpiDevice, error) {
	key := spiKey{bus, cs}
	h.spiMu.Lock()
	d, ok := h.spiDevs[key]
	h.spiMu.Unlock()
	if ok {
		return d, nil
	}
	d, err := h.client.SpiManager.Open(bus, cs, 1000000, 8, 0, false)
	if err != nil {
		return nil, err
	}
	h.spiMu.Lock()
	h.spiDevs[key] = d
	h.spiMu.Unlock()
	return d, nil
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
	bus, err := queryUint32(r, "bus")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	cs, err := queryUint32(r, "chipSelect")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	h.spiMu.Lock()
	d, ok := h.spiDevs[spiKey{bus, cs}]
	h.spiMu.Unlock()
	if !ok {
		http.Error(w, "device not configured", http.StatusNotFound)
		return
	}
	cfg, err := d.GetConfig()
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
	if !decodeJSONBody(w, r, &req) {
		return
	}
	d, err := h.client.SpiManager.Open(req.Bus, req.ChipSelect, req.MaxSpeedHz, req.BitsPerWord, int(req.Mode), req.LsbFirst)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	h.spiMu.Lock()
	h.spiDevs[spiKey{req.Bus, req.ChipSelect}] = d
	h.spiMu.Unlock()
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *APIHandler) spiTransfer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Bus        uint32 `json:"bus"`
		ChipSelect uint32 `json:"chipSelect"`
		DataOut    string `json:"dataOut"`
		ReadLength uint32 `json:"readLength"`
	}
	if !decodeJSONBody(w, r, &req) {
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
	d, err := h.getOrOpenSpiDevice(req.Bus, req.ChipSelect)
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	dataIn, err := d.Transfer(dataOut, req.ReadLength)
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
