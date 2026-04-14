package handlers

import orbitclient "orbit-os-sdk-go/client"

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
