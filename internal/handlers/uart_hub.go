package handlers

import (
	"context"
	"sync"
	"time"

	orbitclient "github.com/OrbitOS-org/orbit-os-sdk-go/v26/client"
)

// uartMsg is one thing a page receives: data, or the reason receiving stopped.
type uartMsg struct {
	data []byte
	err  string
}

// uartHub reads one port once and hands what arrives to every page listening.
// The platform keeps a single read stream per port, and a second one cancels the
// first: a reader per page (two tabs, a reload) would end both.
type uartHub struct {
	mu     sync.Mutex
	subs   map[chan uartMsg]struct{}
	cancel context.CancelFunc
	done   bool
	ended  chan struct{} // closed when the platform stream has ended
}

// uartSubBuffer is how many chunks a slow page may fall behind before it loses
// some; the others keep receiving.
const uartSubBuffer = 256

// prevWait bounds how long a new reader waits for the one it replaces.
const prevWait = 2 * time.Second

// newUartHub starts reading port; onEnd runs when the stream ends for any reason.
// A reader that replaces another (prev) starts only once that one has ended: the
// platform refuses a second stream on a port while the first is still closing.
func newUartHub(port *orbitclient.UartPort, prev *uartHub, onEnd func(*uartHub)) *uartHub {
	ctx, cancel := context.WithCancel(context.Background())
	h := &uartHub{subs: make(map[chan uartMsg]struct{}), cancel: cancel, ended: make(chan struct{})}
	go func() {
		defer close(h.ended)
		if prev != nil {
			select {
			case <-prev.ended:
			case <-time.After(prevWait):
			}
		}
		const maxChunkSize = 256
		err := port.Listen(ctx, maxChunkSize, func(data []byte) {
			h.send(uartMsg{data: append([]byte(nil), data...)})
		})
		if err != nil && ctx.Err() == nil {
			h.send(uartMsg{err: grpcMessage(err)})
		}
		h.stop()
		onEnd(h)
	}()
	return h
}

func (h *uartHub) send(m uartMsg) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- m:
		default: // this page is too slow: it misses this chunk, the others do not
		}
	}
}

// subscribe adds a page; ok is false when the hub has already stopped.
func (h *uartHub) subscribe() (ch chan uartMsg, ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.done {
		return nil, false
	}
	ch = make(chan uartMsg, uartSubBuffer)
	h.subs[ch] = struct{}{}
	return ch, true
}

// unsubscribe removes a page that left; the last one out stops the reading.
func (h *uartHub) unsubscribe(ch chan uartMsg) {
	h.mu.Lock()
	_, ok := h.subs[ch]
	delete(h.subs, ch)
	last := ok && len(h.subs) == 0
	if last {
		h.done = true // no page joins a reader that is stopping
	}
	h.mu.Unlock()
	if last {
		h.cancel()
	}
}

// stop ends the reading and closes every page's channel (once).
func (h *uartHub) stop() {
	h.cancel()
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.done {
		return
	}
	h.done = true
	for ch := range h.subs {
		close(ch)
		delete(h.subs, ch)
	}
}

// alive tells whether pages can still join.
func (h *uartHub) alive() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return !h.done
}
