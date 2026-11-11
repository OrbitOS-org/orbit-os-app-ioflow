package handlers

import (
	"bytes"
	"net/http/httptest"
	"testing"

	orbitclient "github.com/OrbitOS-org/orbit-os-sdk-go/v26/client"
)

func TestParseFlexibleHex(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    []byte
		wantErr bool
	}{
		{name: "empty", in: "", want: nil},
		{name: "plain", in: "48656c", want: []byte{0x48, 0x65, 0x6c}},
		{name: "spaced and prefixed", in: "0x48 0x65 6C", want: []byte{0x48, 0x65, 0x6c}},
		{name: "separators", in: "48:65-6c,00;ff", want: []byte{0x48, 0x65, 0x6c, 0x00, 0xff}},
		{name: "odd number of digits is padded", in: "f", want: []byte{0x0f}},
		{name: "letter that is not hex", in: "zz", wantErr: true},
		{name: "half invalid", in: "48 6g", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseFlexibleHex(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("parseFlexibleHex(%q) = % x, want an error", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseFlexibleHex(%q): %v", tc.in, err)
			}
			if !bytes.Equal(got, tc.want) {
				t.Errorf("parseFlexibleHex(%q) = % x, want % x", tc.in, got, tc.want)
			}
		})
	}
}

func TestParseGpioLevel(t *testing.T) {
	cases := []struct {
		in      string
		want    orbitclient.GpioLevel
		wantErr bool
	}{
		{in: "HIGH", want: orbitclient.GPIO_LEVEL_HIGH},
		{in: "high", want: orbitclient.GPIO_LEVEL_HIGH},
		{in: "1", want: orbitclient.GPIO_LEVEL_HIGH},
		{in: "LOW", want: orbitclient.GPIO_LEVEL_LOW},
		{in: " low ", want: orbitclient.GPIO_LEVEL_LOW},
		{in: "", wantErr: true},
		{in: "maybe", wantErr: true},
	}

	for _, tc := range cases {
		got, err := parseGpioLevel(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("parseGpioLevel(%q) = %v, want an error", tc.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseGpioLevel(%q): %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("parseGpioLevel(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

// A direction the app does not understand must never become OUT: that would start
// driving whatever is wired to the pin.
func TestParseGpioDirection(t *testing.T) {
	cases := []struct {
		in      string
		want    orbitclient.GpioDirection
		wantErr bool
	}{
		{in: "IN", want: orbitclient.GPIO_DIR_IN},
		{in: "input", want: orbitclient.GPIO_DIR_IN},
		{in: "OUT", want: orbitclient.GPIO_DIR_OUT},
		{in: "output", want: orbitclient.GPIO_DIR_OUT},
		{in: "", wantErr: true},
		{in: "outp", wantErr: true},
		{in: "0", wantErr: true},
	}

	for _, tc := range cases {
		got, err := parseGpioDirection(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("parseGpioDirection(%q) = %v, want an error", tc.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseGpioDirection(%q): %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("parseGpioDirection(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

func TestParseUartSettings(t *testing.T) {
	if got := parseUartParity("EVEN"); got != orbitclient.UartParityEven {
		t.Errorf(`parseUartParity("EVEN") = %v`, got)
	}
	if got := parseUartParity(" odd "); got != orbitclient.UartParityOdd {
		t.Errorf(`parseUartParity(" odd ") = %v`, got)
	}
	if got := parseUartParity("whatever"); got != orbitclient.UartParityNone {
		t.Errorf(`parseUartParity("whatever") = %v, want none`, got)
	}

	if got := parseUartStopBits("2"); got != orbitclient.UartStopBits2 {
		t.Errorf(`parseUartStopBits("2") = %v`, got)
	}
	if got := parseUartStopBits("1"); got != orbitclient.UartStopBits1 {
		t.Errorf(`parseUartStopBits("1") = %v`, got)
	}

	if got := parseUartFlowControl("RTS/CTS"); got != orbitclient.UartFlowHardware {
		t.Errorf(`parseUartFlowControl("RTS/CTS") = %v`, got)
	}
	if got := parseUartFlowControl("xonxoff"); got != orbitclient.UartFlowSoftware {
		t.Errorf(`parseUartFlowControl("xonxoff") = %v`, got)
	}
	if got := parseUartFlowControl(""); got != orbitclient.UartFlowNone {
		t.Errorf(`parseUartFlowControl("") = %v, want none`, got)
	}
}

func TestQueryNumbers(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/gpio/level?number=26&chip=0&bus=1", nil)

	if got, err := queryInt32(r, "number"); err != nil || got != 26 {
		t.Errorf("queryInt32(number) = %d, %v", got, err)
	}
	if got, err := queryUint32(r, "bus"); err != nil || got != 1 {
		t.Errorf("queryUint32(bus) = %d, %v", got, err)
	}
	if _, err := queryInt32(r, "missing"); err == nil {
		t.Error("queryInt32 on a parameter that is not there: want an error")
	}

	bad := httptest.NewRequest("GET", "/api/gpio/level?number=twenty-six&bus=-1", nil)
	if _, err := queryInt32(bad, "number"); err == nil {
		t.Error(`queryInt32("twenty-six"): want an error`)
	}
	if _, err := queryUint32(bad, "bus"); err == nil {
		t.Error(`queryUint32("-1"): want an error`)
	}
}
