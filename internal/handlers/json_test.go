package handlers

import (
	"encoding/json"
	"testing"

	orbitclient "github.com/OrbitOS-org/orbit-os-sdk-go/v26/client"
)

func TestGpioPinsForAPI(t *testing.T) {
	pins := []*orbitclient.GpioPin{
		{Name: "GPIO17", Number: 17, ChipNumber: 0},
		nil, // the platform list can carry a hole; it must not reach the page
		{Name: "GPIO27", Number: 27, ChipNumber: 0},
	}

	got := gpioPinsForAPI(pins)
	if len(got) != 2 {
		t.Fatalf("got %d pins, want 2", len(got))
	}
	if got[0].Name != "GPIO17" || got[0].Number != 17 {
		t.Errorf("first pin = %+v", got[0])
	}

	// The page reads these names: they are part of the contract with the UI.
	raw, err := json.Marshal(got[0])
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"name":"GPIO17","number":17,"chipNumber":0}`
	if string(raw) != want {
		t.Errorf("JSON = %s, want %s", raw, want)
	}
}

func TestGpioPinsForAPIEmptyIsNotNull(t *testing.T) {
	raw, err := json.Marshal(gpioPinsForAPI(nil))
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "[]" {
		t.Errorf("JSON = %s, want []", raw)
	}
}

func TestGpioStateJSONLeavesUnreadPinsEmpty(t *testing.T) {
	// A pin that could not be read must not report LOW and OUT, which are the zero
	// values, as if they had been measured.
	raw, err := json.Marshal(gpioStateJSON{Name: "GPIO5", Number: 5, Error: "line busy"})
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"name":"GPIO5","number":5,"chipNumber":0,"error":"line busy"}`
	if string(raw) != want {
		t.Errorf("JSON = %s, want %s", raw, want)
	}
}

func TestPwmPropertiesForAPI(t *testing.T) {
	if got := pwmPropertiesForAPI(nil); got.Enabled || got.Channel != nil {
		t.Errorf("pwmPropertiesForAPI(nil) = %+v, want the zero value", got)
	}

	got := pwmPropertiesForAPI(&orbitclient.PwmProperties{
		Channel:     &orbitclient.PwmChannel{Name: "pwm0", Channel: 0},
		Enabled:     true,
		DutyCycle:   0.5,
		FrequencyHz: 1000,
	})
	if got.Channel == nil || got.Channel.Name != "pwm0" {
		t.Fatalf("channel = %+v", got.Channel)
	}
	if !got.Enabled || got.DutyCycle != 0.5 || got.FrequencyHz != 1000 {
		t.Errorf("properties = %+v", got)
	}
}

func TestOrbitUartConfigToJSON(t *testing.T) {
	got := orbitUartConfigToJSON(&orbitclient.UartConfig{
		Port:        "ttyS0",
		Baudrate:    115200,
		DataBits:    8,
		Parity:      orbitclient.UartParityEven,
		StopBits:    orbitclient.UartStopBits2,
		FlowControl: orbitclient.UartFlowHardware,
	})

	want := uartConfigJSON{
		Port: "ttyS0", Baudrate: 115200, DataBits: 8,
		Parity: "even", StopBits: "2", FlowControl: "rtscts",
	}
	if got != want {
		t.Errorf("config = %+v, want %+v", got, want)
	}

	plain := orbitUartConfigToJSON(&orbitclient.UartConfig{Port: "ttyS0"})
	if plain.Parity != "none" || plain.StopBits != "1" || plain.FlowControl != "none" {
		t.Errorf("defaults = %+v", plain)
	}
}

func TestUartDefaultConfigJSON(t *testing.T) {
	got := uartDefaultConfigJSON("ttyS0")
	if got.Port != "ttyS0" || got.Baudrate != 115200 || got.DataBits != 8 {
		t.Errorf("defaults = %+v", got)
	}
}
