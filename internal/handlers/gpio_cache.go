package handlers

import (
	"fmt"
	"sync"
	"time"

	orbitclient "github.com/OrbitOS-org/orbit-os-sdk-go/v26/client"
)

// directionMaxAge is how long a pin's direction is trusted without asking. The
// app knows when it changes one itself; this only bounds how long a change made
// by another app takes to show.
const directionMaxAge = 10 * time.Second

// gpioCache spares the platform the calls whose answer does not change: on a
// board whose pins sit behind a microcontroller each call is a round trip on a
// serial link, and the table refreshes every second.
type gpioCache struct {
	mu     sync.Mutex
	pins   []*orbitclient.GpioPin
	dirs   map[string]orbitclient.GpioDirection
	dirsAt time.Time
}

// pinKey names a pin: by its name, which is unique on every board; chip and
// line only for a pin without one.
func pinKey(p *orbitclient.GpioPin) string {
	if p.Name != "" {
		return p.Name
	}
	return fmt.Sprintf("%d:%d", p.ChipNumber, p.Number)
}

// list returns the pins, asking the platform only the first time (and after a
// reset). An empty answer is not kept, so a platform still starting is asked
// again.
func (c *gpioCache) list(fetch func() ([]*orbitclient.GpioPin, error)) ([]*orbitclient.GpioPin, error) {
	c.mu.Lock()
	pins := c.pins
	c.mu.Unlock()
	if pins != nil {
		return pins, nil
	}
	pins, err := fetch()
	if err != nil {
		return nil, err
	}
	if len(pins) > 0 {
		c.mu.Lock()
		c.pins = pins
		c.mu.Unlock()
	}
	return pins, nil
}

// directions returns the known directions and whether they are too old (or
// missing) to use, in which case the caller reads them all again.
func (c *gpioCache) directions() (map[string]orbitclient.GpioDirection, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	stale := c.dirs == nil || time.Since(c.dirsAt) > directionMaxAge
	out := make(map[string]orbitclient.GpioDirection, len(c.dirs))
	for k, v := range c.dirs {
		out[k] = v
	}
	return out, stale
}

// storeDirections keeps a full read of the directions.
func (c *gpioCache) storeDirections(dirs map[string]orbitclient.GpioDirection) {
	c.mu.Lock()
	c.dirs, c.dirsAt = dirs, time.Now()
	c.mu.Unlock()
}

// setDirection records a direction the app has just set.
func (c *gpioCache) setDirection(key string, d orbitclient.GpioDirection) {
	c.mu.Lock()
	if c.dirs != nil {
		c.dirs[key] = d
	}
	c.mu.Unlock()
}

// forget drops one pin's direction, so the next refresh asks for it.
func (c *gpioCache) forget(key string) {
	c.mu.Lock()
	delete(c.dirs, key)
	c.mu.Unlock()
}

// reset forgets everything: after the platform restarts, pins and directions may
// have changed.
func (c *gpioCache) reset() {
	c.mu.Lock()
	c.pins, c.dirs = nil, nil
	c.mu.Unlock()
}
