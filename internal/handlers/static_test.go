package handlers

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func staticFS() fstest.MapFS {
	return fstest.MapFS{
		"css/style.css": {Data: []byte(strings.Repeat("body{color:red}\n", 200))},
		"font.woff2":    {Data: []byte("wOF2 not compressible here")},
	}
}

func get(h http.Handler, url string, hdr map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, url, nil)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestStaticGzipWhenAsked(t *testing.T) {
	h := NewStaticHandler(staticFS())
	rec := get(h, "/css/style.css", map[string]string{"Accept-Encoding": "gzip, br"})
	if rec.Code != 200 || rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("code %d, encoding %q; want 200 gzip", rec.Code, rec.Header().Get("Content-Encoding"))
	}
	zr, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(zr)
	if !bytes.Equal(body, staticFS()["css/style.css"].Data) {
		t.Fatal("gzip body differs from the file")
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/css") {
		t.Fatalf("content type %q", ct)
	}
}

func TestStaticPlainWithoutGzip(t *testing.T) {
	h := NewStaticHandler(staticFS())
	rec := get(h, "/css/style.css", nil)
	if rec.Header().Get("Content-Encoding") != "" || rec.Body.Len() != len(staticFS()["css/style.css"].Data) {
		t.Fatal("a client without gzip must get the plain file")
	}
}

func TestStaticFontsNotCompressed(t *testing.T) {
	rec := get(NewStaticHandler(staticFS()), "/font.woff2", map[string]string{"Accept-Encoding": "gzip"})
	if rec.Header().Get("Content-Encoding") != "" {
		t.Fatal("woff2 is already compressed")
	}
}

func TestStaticCacheHeaders(t *testing.T) {
	h := NewStaticHandler(staticFS())
	if cc := get(h, "/css/style.css?v=1.1.2", nil).Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Fatalf("versioned URL: Cache-Control %q, want immutable", cc)
	}
	if cc := get(h, "/css/style.css", nil).Header().Get("Cache-Control"); cc != "no-cache" {
		t.Fatalf("plain URL: Cache-Control %q, want no-cache", cc)
	}
}

func TestStaticNotModified(t *testing.T) {
	h := NewStaticHandler(staticFS())
	etag := get(h, "/css/style.css", nil).Header().Get("ETag")
	if etag == "" {
		t.Fatal("no ETag")
	}
	rec := get(h, "/css/style.css", map[string]string{"If-None-Match": etag})
	if rec.Code != http.StatusNotModified || rec.Body.Len() != 0 {
		t.Fatalf("code %d, %d bytes; want 304 and no body", rec.Code, rec.Body.Len())
	}
}

func TestStaticMissingAndDirs(t *testing.T) {
	h := NewStaticHandler(staticFS())
	for _, u := range []string{"/nope.js", "/css", "/../css/style.css/.."} {
		if code := get(h, u, nil).Code; code != http.StatusNotFound {
			t.Errorf("%s: code %d, want 404", u, code)
		}
	}
}
