package handlers

import orbitclient "github.com/OrbitOS-org/orbit-os-sdk-go/v26/client"

type gpioPinJSON struct {
	Name       string `json:"name"`
	Number     int32  `json:"number"`
	ChipNumber int32  `json:"chipNumber"`
}

func gpioPinsForAPI(pins []*orbitclient.GpioPin) []gpioPinJSON {
	out := make([]gpioPinJSON, 0, len(pins))
	for _, p := range pins {
		if p == nil {
			continue
		}
		out = append(out, gpioPinJSON{Name: p.Name, Number: p.Number, ChipNumber: p.ChipNumber})
	}
	return out
}

// gpioStateJSON is one line of the table: the pin and what it is doing. Level and
// direction are pointers so that a pin which could not be read says so, instead of
// reporting the zero values (LOW and OUT) as if they had been measured.
type gpioStateJSON struct {
	Name       string `json:"name"`
	Number     int32  `json:"number"`
	ChipNumber int32  `json:"chipNumber"`
	Level      *int32 `json:"level,omitempty"`
	Direction  *int32 `json:"direction,omitempty"`
	Error      string `json:"error,omitempty"`
}

type pwmChannelJSON struct {
	Name   string `json:"name"`
	Number uint32 `json:"number"`
}

func pwmChannelsForAPI(chs []*orbitclient.PwmChannel) []pwmChannelJSON {
	out := make([]pwmChannelJSON, 0, len(chs))
	for _, ch := range chs {
		if ch == nil {
			continue
		}
		out = append(out, pwmChannelJSON{Name: ch.Name, Number: ch.Channel})
	}
	return out
}

type pwmPropertiesJSON struct {
	Channel     *pwmChannelJSON `json:"channel,omitempty"`
	Enabled     bool            `json:"enabled"`
	DutyCycle   float64         `json:"dutyCycle"`
	FrequencyHz float64         `json:"frequencyHz"`
}

func pwmPropertiesForAPI(p *orbitclient.PwmProperties) pwmPropertiesJSON {
	if p == nil {
		return pwmPropertiesJSON{}
	}
	var ch *pwmChannelJSON
	if p.Channel != nil {
		ch = &pwmChannelJSON{Name: p.Channel.Name, Number: p.Channel.Channel}
	}
	return pwmPropertiesJSON{
		Channel:     ch,
		Enabled:     p.Enabled,
		DutyCycle:   p.DutyCycle,
		FrequencyHz: p.FrequencyHz,
	}
}
