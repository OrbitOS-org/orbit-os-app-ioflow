package handlers

import (
	"bytes"
	"embed"
	"fmt"
	"hash/crc32"
	"html/template"
	"io/fs"
	"net/http"
	"sync"
)

type PageData struct {
	Title      string
	Page       string
	PageTitle  string
	ScriptFile string
	Version    string
	DevMode    bool
}

type WebHandler struct {
	templatesFS embed.FS
	staticFS    fs.FS
	pages       sync.Map // page name → *asset
}

// NewWebHandlerWithFS serves the pages in templatesFS; staticFS holds the files
// they link to (served under /static/).
func NewWebHandlerWithFS(templatesFS embed.FS, staticFS fs.FS) *WebHandler {
	return &WebHandler{templatesFS: templatesFS, staticFS: staticFS}
}

// assetURL is a static file's URL with a code of its content: a file that changes
// gets a new URL, so a browser never keeps an old copy (the files are cached for
// good under each URL).
func (h *WebHandler) assetURL(name string) string {
	body, err := fs.ReadFile(h.staticFS, name)
	if err != nil {
		return "/static/" + name
	}
	return fmt.Sprintf("/static/%s?v=%08x", name, crc32.ChecksumIEEE(body))
}

func (h *WebHandler) readEmbeddedFile(path string) (string, error) {
	data, err := fs.ReadFile(h.templatesFS, path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// render builds a page. What goes into it does not change while the app runs,
// so each page is built once and then served from memory.
func (h *WebHandler) render(pageName string) (*asset, int, error) {
	baseContent, err := h.readEmbeddedFile("templates/base.html")
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}
	pageContent, err := h.readEmbeddedFile("templates/pages/" + pageName + ".html")
	if err != nil {
		return nil, http.StatusNotFound, err
	}
	tmpl, err := template.New("base").Funcs(template.FuncMap{"asset": h.assetURL}).Parse(baseContent + "\n" + pageContent)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	const title = "IOFlow"
	ver := RuntimeApp.Version
	if ver == "" {
		ver = "0.0.0"
	}
	data := PageData{
		Title:      title,
		Page:       pageName,
		PageTitle:  title,
		ScriptFile: pageName,
		Version:    ver,
		DevMode:    false,
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, http.StatusInternalServerError, err
	}
	return newAsset(pageName+".html", buf.Bytes()), http.StatusOK, nil
}

func (h *WebHandler) HandlePage(w http.ResponseWriter, r *http.Request, pageName string) {
	if v, ok := h.pages.Load(pageName); ok {
		v.(*asset).serve(w, r)
		return
	}
	a, code, err := h.render(pageName)
	if err != nil {
		http.Error(w, err.Error(), code)
		return
	}
	v, _ := h.pages.LoadOrStore(pageName, a)
	v.(*asset).serve(w, r)
}

func (h *WebHandler) HandleGpio(w http.ResponseWriter, r *http.Request) {
	h.HandlePage(w, r, "gpio")
}
