package main

import (
	"bytes"
	"compress/gzip"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"
)

func testAtlasServer(t *testing.T) *atlasServer {
	t.Helper()
	public, err := fs.Sub(embeddedFiles, "public")
	if err != nil {
		t.Fatal(err)
	}
	server, err := newAtlasServer(public)
	if err != nil {
		t.Fatal(err)
	}
	return server
}

func TestStaticCompressionCachingAndHead(t *testing.T) {
	server := testAtlasServer(t)
	for _, item := range []struct {
		name   string
		asset  string
		target string
	}{
		{"app.js/root", "app.js", "/app.js"},
		{"app.js/versioned", "app.js", server.assetPrefix + "app.js"},
		{"styles.css/root", "styles.css", "/styles.css"},
		{"styles.css/versioned", "styles.css", server.assetPrefix + "styles.css"},
		{"dashboard.js/root", "dashboard.js", "/dashboard.js"},
		{"dashboard.js/versioned", "dashboard.js", server.assetPrefix + "dashboard.js"},
		{"dashboard.css/root", "dashboard.css", "/dashboard.css"},
		{"dashboard.css/versioned", "dashboard.css", server.assetPrefix + "dashboard.css"},
	} {
		t.Run(item.name, func(t *testing.T) {
			source, err := fs.ReadFile(embeddedFiles, "public/"+item.asset)
			if err != nil {
				t.Fatal(err)
			}
			gzipped := request(server, http.MethodGet, item.target, nil, map[string]string{"Accept-Encoding": "gzip"})
			if gzipped.Code != http.StatusOK || gzipped.Header().Get("Content-Encoding") != "gzip" || gzipped.Header().Get("Vary") != "Accept-Encoding" || gzipped.Header().Get("Cache-Control") != "no-cache" {
				t.Fatalf("gzip response: status=%d headers=%v", gzipped.Code, gzipped.Header())
			}
			if gzipped.Body.Len() >= len(source) {
				t.Fatalf("gzip did not reduce %s: raw=%d gzip=%d", item.asset, len(source), gzipped.Body.Len())
			}
			reader, err := gzip.NewReader(bytes.NewReader(gzipped.Body.Bytes()))
			if err != nil {
				t.Fatal(err)
			}
			decoded, err := io.ReadAll(reader)
			if closeErr := reader.Close(); err == nil {
				err = closeErr
			}
			if err != nil || !bytes.Equal(decoded, source) {
				t.Fatalf("gzip did not decode to source: err=%v", err)
			}

			identity := request(server, http.MethodGet, item.target, nil, map[string]string{"Accept-Encoding": "gzip;q=0, identity"})
			if identity.Header().Get("Content-Encoding") != "" || !bytes.Equal(identity.Body.Bytes(), source) {
				t.Fatal("q=0 did not select the identity representation")
			}
			if identity.Header().Get("ETag") == gzipped.Header().Get("ETag") {
				t.Fatal("gzip and identity ETags match")
			}

			conditional := request(server, http.MethodGet, item.target, nil, map[string]string{
				"Accept-Encoding": "gzip", "If-None-Match": gzipped.Header().Get("ETag"),
			})
			if conditional.Code != http.StatusNotModified || conditional.Body.Len() != 0 || conditional.Header().Get("Content-Length") != "" {
				t.Fatalf("conditional response: status=%d body=%d headers=%v", conditional.Code, conditional.Body.Len(), conditional.Header())
			}
			head := request(server, http.MethodHead, item.target, nil, map[string]string{"Accept-Encoding": "gzip"})
			if head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("Content-Encoding") != "gzip" || head.Header().Get("ETag") != gzipped.Header().Get("ETag") || head.Header().Get("Content-Length") != strconv.Itoa(gzipped.Body.Len()) {
				t.Fatalf("HEAD response: status=%d body=%d headers=%v", head.Code, head.Body.Len(), head.Header())
			}
		})
	}
}

func TestVersionedStaticAssets(t *testing.T) {
	server := testAtlasServer(t)
	fingerprint := strings.TrimSuffix(strings.TrimPrefix(server.assetPrefix, "/assets/"), "/")
	if len(fingerprint) != 16 {
		t.Fatalf("asset prefix %q does not contain a 16-character fingerprint", server.assetPrefix)
	}
	if _, err := strconv.ParseUint(fingerprint, 16, 64); err != nil {
		t.Fatalf("asset fingerprint %q is not hexadecimal", fingerprint)
	}

	for _, item := range []struct {
		name   string
		target string
		links  [][2]string
	}{
		{
			name: "index", target: "/",
			links: [][2]string{{`href="` + server.assetPrefix + `styles.css"`, `href="/styles.css"`}, {`src="` + server.assetPrefix + `app.js"`, `src="/app.js"`}},
		},
		{
			name: "dashboard", target: "/dashboard",
			links: [][2]string{{`href="` + server.assetPrefix + `dashboard.css"`, `href="/dashboard.css"`}, {`src="` + server.assetPrefix + `dashboard.js"`, `src="/dashboard.js"`}},
		},
	} {
		response := request(server, http.MethodGet, item.target, nil, nil)
		body := response.Body.String()
		if response.Code != http.StatusOK || strings.Count(body, server.assetPrefix) != 2 {
			t.Fatalf("%s does not reference one versioned asset prefix: status=%d prefix=%q", item.name, response.Code, server.assetPrefix)
		}
		for _, link := range item.links {
			if !strings.Contains(body, link[0]) || strings.Contains(body, link[1]) {
				t.Fatalf("%s asset reference was not rewritten", item.name)
			}
		}
	}

	for _, item := range []struct {
		name        string
		contentType string
	}{
		{"app.js", "text/javascript"},
		{"styles.css", "text/css"},
		{"model.js", "text/javascript"},
		{"dashboard.js", "text/javascript"},
		{"dashboard.css", "text/css"},
		{"dashboard-model.js", "text/javascript"},
	} {
		source, err := fs.ReadFile(embeddedFiles, "public/"+item.name)
		if err != nil {
			t.Fatal(err)
		}
		response := request(server, http.MethodGet, server.assetPrefix+item.name, nil, nil)
		if response.Code != http.StatusOK || !strings.HasPrefix(response.Header().Get("Content-Type"), item.contentType) || !bytes.Equal(response.Body.Bytes(), source) {
			t.Errorf("versioned %s: status=%d type=%q bytesMatch=%t", item.name, response.Code, response.Header().Get("Content-Type"), bytes.Equal(response.Body.Bytes(), source))
		}
	}

	for _, target := range []string{
		"/assets/0000000000000000/app.js",
		server.assetPrefix + "../app.js",
		server.assetPrefix + "%2e%2e/app.js",
	} {
		if response := request(server, http.MethodGet, target, nil, nil); response.Code != http.StatusNotFound {
			t.Errorf("unsafe asset path %q returned %d", target, response.Code)
		}
	}
}

func TestStaticAssetFingerprint(t *testing.T) {
	public := fstest.MapFS{
		"app.js":     {Data: []byte("import './model.js';")},
		"model.js":   {Data: []byte("export default 1;")},
		"styles.css": {Data: []byte("body {}")},
		"index.html": {Data: []byte("ignored")},
	}
	original, err := staticAssetFingerprint(public)
	if err != nil {
		t.Fatal(err)
	}
	repeated, err := staticAssetFingerprint(public)
	if err != nil || repeated != original {
		t.Fatalf("fingerprint is not deterministic: first=%q second=%q err=%v", original, repeated, err)
	}

	app := public["app.js"]
	public["app.js"] = &fstest.MapFile{Data: []byte("import './changed.js';")}
	changedJS, err := staticAssetFingerprint(public)
	if err != nil || changedJS == original {
		t.Fatalf("JavaScript change did not change fingerprint: got=%q err=%v", changedJS, err)
	}
	public["app.js"] = app

	styles := public["styles.css"]
	public["styles.css"] = &fstest.MapFile{Data: []byte("body { color: red; }")}
	changedCSS, err := staticAssetFingerprint(public)
	if err != nil || changedCSS == original {
		t.Fatalf("CSS change did not change fingerprint: got=%q err=%v", changedCSS, err)
	}
	public["styles.css"] = styles

	public["index.html"] = &fstest.MapFile{Data: []byte("changed but not an asset")}
	changedHTML, err := staticAssetFingerprint(public)
	if err != nil || changedHTML != original {
		t.Fatalf("non-JS/CSS change affected fingerprint: got=%q want=%q err=%v", changedHTML, original, err)
	}
}

func request(server http.Handler, method, target string, body []byte, headers map[string]string) *httptest.ResponseRecorder {
	record := httptest.NewRecorder()
	req := httptest.NewRequest(method, target, bytes.NewReader(body))
	req.Host = "localhost"
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	server.ServeHTTP(record, req)
	return record
}

func TestStaticServerHealthAssetsAndRestrictions(t *testing.T) {
	server := testAtlasServer(t)
	for _, item := range []struct {
		path        string
		status      int
		contentType string
	}{
		{"/", http.StatusOK, "text/html"},
		{"/dashboard", http.StatusOK, "text/html"},
		{"/dashboard/", http.StatusOK, "text/html"},
		{"/dashboard/extra", http.StatusNotFound, "text/plain"},
		{"/model.js", http.StatusOK, "text/javascript"},
		{"/dashboard-model.js", http.StatusOK, "text/javascript"},
		{"/logos/docker.svg", http.StatusOK, "image/svg+xml"},
		{"/healthz", http.StatusOK, "text/plain"},
		{"/licenses/", http.StatusNotFound, "text/plain"},
		{"/../main.go", http.StatusNotFound, "text/plain"},
		{"/.git/config", http.StatusNotFound, "text/plain"},
		{"/api/discovery/sources", http.StatusNotFound, "text/plain"},
	} {
		record := request(server, http.MethodGet, item.path, nil, nil)
		if record.Code != item.status || !strings.HasPrefix(record.Header().Get("Content-Type"), item.contentType) {
			t.Errorf("%s: status=%d type=%q", item.path, record.Code, record.Header().Get("Content-Type"))
		}
		if record.Header().Get("Content-Security-Policy") != securityPolicy || record.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("%s: missing security headers", item.path)
		}
	}
	record := request(server, http.MethodPost, "/", nil, nil)
	if record.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST static status %d", record.Code)
	}
	record = request(server, http.MethodHead, "/app.js", nil, nil)
	if record.Code != http.StatusOK || record.Body.Len() != 0 {
		t.Fatalf("HEAD asset status=%d body=%d", record.Code, record.Body.Len())
	}
}
