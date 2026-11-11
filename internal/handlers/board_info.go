package handlers

import (
	"encoding/json"
	"net/http"
	"sync"
)

// boardInfoJSON names the board in the page header. Either field may be empty:
// the page then shows only what it has.
type boardInfoJSON struct {
	Vendor string `json:"vendor"`
	Model  string `json:"model"`
}

var (
	boardInfoMu    sync.Mutex
	boardInfoCache *boardInfoJSON
)

// boardInfo answers the board's vendor and model, asked once: they do not change
// while the app runs. A failed read is not kept, so it is tried again.
func (h *APIHandler) boardInfo(w http.ResponseWriter, r *http.Request) {
	boardInfoMu.Lock()
	cached := boardInfoCache
	boardInfoMu.Unlock()
	if cached == nil {
		info := boardInfoJSON{}
		var err error
		if h.client != nil && h.client.SystemManager != nil {
			info.Vendor, err = h.client.SystemManager.GetBoardVendor()
			if err == nil {
				info.Model, err = h.client.SystemManager.GetBoardModel()
			}
		}
		if err == nil {
			boardInfoMu.Lock()
			boardInfoCache = &info
			boardInfoMu.Unlock()
		}
		cached = &info
	}
	json.NewEncoder(w).Encode(cached)
}
