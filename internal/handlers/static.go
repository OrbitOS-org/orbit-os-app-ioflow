package handlers

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"hash/crc32"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"sync"
)

// asset is one file as it is sent: the bytes, their gzip copy when that is
// smaller, and an ETag from the content.
type asset struct {
	body  []byte
	gz    []byte
	ctype string
	etag  string
}

// compressible lists the types worth compressing; fonts and images already are.
var compressible = map[string]bool{
	".css": true, ".js": true, ".svg": true, ".html": true, ".json": true, ".txt": true,
}

// newAsset prepares body for sending under name (used for its type).
func newAsset(name string, body []byte) *asset {
	ext := strings.ToLower(path.Ext(name))
	ctype := mime.TypeByExtension(ext)
	if ctype == "" {
		ctype = http.DetectContentType(body)
	}
	a := &asset{body: body, ctype: ctype, etag: fmt.Sprintf(`"%08x-%x"`, crc32.ChecksumIEEE(body), len(body))}
	if compressible[ext] {
		var buf bytes.Buffer
		zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
		_, _ = zw.Write(body)
		_ = zw.Close()
		if buf.Len() < len(body) {
			a.gz = buf.Bytes()
		}
	}
	return a
}

// serve answers with a, or 304 when the browser already has it. Pages that ask
// with the app version in the URL (?v=) never change under that URL, so the
// browser keeps them; anything else is checked with the ETag on each use.
func (a *asset) serve(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("ETag", a.etag)
	h.Set("Vary", "Accept-Encoding")
	h.Set("X-Content-Type-Options", "nosniff")
	if r.URL.Query().Get("v") != "" {
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		h.Set("Cache-Control", "no-cache")
	}
	if inm := r.Header.Get("If-None-Match"); inm != "" && etagMatch(inm, a.etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	h.Set("Content-Type", a.ctype)
	body := a.body
	if a.gz != nil && acceptsGzip(r) {
		h.Set("Content-Encoding", "gzip")
		body = a.gz
	}
	h.Set("Content-Length", fmt.Sprint(len(body)))
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(body)
}

func etagMatch(header, etag string) bool {
	for _, t := range strings.Split(header, ",") {
		t = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(t), "W/"))
		if t == etag || t == "*" {
			return true
		}
	}
	return false
}

func acceptsGzip(r *http.Request) bool {
	for _, p := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		if strings.TrimSpace(strings.SplitN(p, ";", 2)[0]) == "gzip" {
			return true
		}
	}
	return false
}

// StaticHandler serves the embedded files. Each file is read and compressed
// once, the first time it is asked for: the files cannot change while the app
// runs.
type StaticHandler struct {
	fsys  fs.FS
	cache sync.Map // name → *asset
}

func NewStaticHandler(fsys fs.FS) *StaticHandler { return &StaticHandler{fsys: fsys} }

func (s *StaticHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if v, ok := s.cache.Load(name); ok {
		v.(*asset).serve(w, r)
		return
	}
	body, err := fs.ReadFile(s.fsys, name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	v, _ := s.cache.LoadOrStore(name, newAsset(name, body))
	v.(*asset).serve(w, r)
}
