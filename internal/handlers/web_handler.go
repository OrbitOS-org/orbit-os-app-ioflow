package handlers

import (
	"embed"
	"html/template"
	"io/fs"
	"net/http"

)

type PageData struct {
	Title         string
	Page          string
	PageTitle     string
	ScriptFile    string
	Version       string
	DevMode       bool
	LoadLogViewer bool
}

type WebHandler struct {
	templatesFS embed.FS
}

func NewWebHandlerWithFS(templatesFS embed.FS) *WebHandler {
	return &WebHandler{templatesFS: templatesFS}
}

func (h *WebHandler) readEmbeddedFile(path string) (string, error) {
	data, err := fs.ReadFile(h.templatesFS, path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (h *WebHandler) HandlePage(w http.ResponseWriter, r *http.Request, pageName string) {
	baseContent, err := h.readEmbeddedFile("templates/base.html")
	if err != nil {
		http.Error(w, "Base template not found", http.StatusInternalServerError)
		return
	}
	pageContent, err := h.readEmbeddedFile("templates/pages/" + pageName + ".html")
	if err != nil {
		http.Error(w, "Page not found", http.StatusNotFound)
		return
	}
	combined := baseContent + "\n" + pageContent
	tmpl, err := template.New("base").Parse(combined)
	if err != nil {
		http.Error(w, "Template parse error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	const title = "Peripherals"
	ver := RuntimeApp.Version
	if ver == "" {
		ver = "0.0.0"
	}
	data := PageData{
		Title:         title,
		Page:          pageName,
		PageTitle:     title,
		ScriptFile:    pageName,
		Version:       ver,
		DevMode:       false,
		LoadLogViewer: false,
	}
	if err := tmpl.Execute(w, data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (h *WebHandler) HandleGpio(w http.ResponseWriter, r *http.Request) {
	h.HandlePage(w, r, "gpio")
}
