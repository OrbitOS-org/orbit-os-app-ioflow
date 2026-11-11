package handlers

import (
	"strings"
	"testing"
	"testing/fstest"
)

func TestAssetURLFollowsContent(t *testing.T) {
	a := &WebHandler{staticFS: fstest.MapFS{"css/style.css": {Data: []byte("body{}")}}}
	b := &WebHandler{staticFS: fstest.MapFS{"css/style.css": {Data: []byte("body{color:red}")}}}
	ua, ub := a.assetURL("css/style.css"), b.assetURL("css/style.css")
	if !strings.HasPrefix(ua, "/static/css/style.css?v=") {
		t.Fatalf("url %q", ua)
	}
	if ua == ub {
		t.Fatal("a file that changed must get a new URL, or browsers keep the old copy")
	}
	if a.assetURL("css/style.css") != ua {
		t.Fatal("the same file must keep its URL")
	}
	if got := a.assetURL("missing.js"); got != "/static/missing.js" {
		t.Fatalf("missing file: %q", got)
	}
}
