package handlers

import (
	"errors"
	"testing"
	"time"

	orbitclient "github.com/OrbitOS-org/orbit-os-sdk-go/v26/client"
)

func TestPinKeyByName(t *testing.T) {
	// Pins behind a microcontroller all come as chip 0 line 0: only the name tells them apart.
	a := &orbitclient.GpioPin{Name: "D2"}
	b := &orbitclient.GpioPin{Name: "D4"}
	if pinKey(a) == pinKey(b) {
		t.Fatal("two pins with the same chip and line but different names share a key")
	}
	if pinKey(&orbitclient.GpioPin{ChipNumber: 1, Number: 5}) != "1:5" {
		t.Fatal("a pin without a name is keyed by chip and line")
	}
}

func TestListAsksOnce(t *testing.T) {
	var c gpioCache
	calls := 0
	fetch := func() ([]*orbitclient.GpioPin, error) {
		calls++
		return []*orbitclient.GpioPin{{Name: "D2"}}, nil
	}
	for i := 0; i < 3; i++ {
		if _, err := c.list(fetch); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 1 {
		t.Fatalf("ListPins called %d times, want 1", calls)
	}
	c.reset()
	_, _ = c.list(fetch)
	if calls != 2 {
		t.Fatal("after a reset the list is asked again")
	}
}

func TestListDoesNotKeepEmptyOrErrors(t *testing.T) {
	var c gpioCache
	calls := 0
	_, _ = c.list(func() ([]*orbitclient.GpioPin, error) { calls++; return nil, nil })
	_, _ = c.list(func() ([]*orbitclient.GpioPin, error) { calls++; return nil, errors.New("down") })
	_, _ = c.list(func() ([]*orbitclient.GpioPin, error) { calls++; return nil, nil })
	if calls != 3 {
		t.Fatalf("an empty or failed list was kept (%d calls)", calls)
	}
}

func TestDirections(t *testing.T) {
	var c gpioCache
	if _, stale := c.directions(); !stale {
		t.Fatal("nothing read yet must be stale")
	}
	c.storeDirections(map[string]orbitclient.GpioDirection{"D2": orbitclient.GPIO_DIR_IN})
	dirs, stale := c.directions()
	if stale || dirs["D2"] != orbitclient.GPIO_DIR_IN {
		t.Fatal("a fresh read must be used")
	}
	c.setDirection("D2", orbitclient.GPIO_DIR_OUT)
	if dirs, _ := c.directions(); dirs["D2"] != orbitclient.GPIO_DIR_OUT {
		t.Fatal("a direction the app set must be kept")
	}
	c.forget("D2")
	if _, known := func() (orbitclient.GpioDirection, bool) { d, _ := c.directions(); v, ok := d["D2"]; return v, ok }(); known {
		t.Fatal("a forgotten pin must be asked again")
	}
	c.mu.Lock()
	c.dirsAt = time.Now().Add(-directionMaxAge - time.Second)
	c.mu.Unlock()
	if _, stale := c.directions(); !stale {
		t.Fatal("directions older than directionMaxAge must be read again")
	}
}
