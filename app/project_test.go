package main

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var projectHeaders = map[string]string{"X-Atlas-Request": "1"}

// The shared project is only served to requests that pass the same host, header and origin checks
// as the discovery API (this blocks DNS rebinding and cross-site reads). The API token is not part
// of it: the editor does not know a token when it starts.
func TestProjectFileRequiresRequestChecks(t *testing.T) {
	file := filepath.Join(t.TempDir(), "project.json")
	if err := os.WriteFile(file, []byte(`{"schemaVersion":6,"title":"one"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	server := testAtlasServer(t)
	server.projectFile = file
	server.apiToken = "a-token-the-editor-does-not-have-at-startup"

	for name, test := range map[string]struct {
		host    string
		headers map[string]string
	}{
		"missing header": {"localhost", nil},
		"foreign host":   {"rebind.example", projectHeaders},
		"foreign origin": {"localhost", map[string]string{"X-Atlas-Request": "1", "Origin": "http://evil.example"}},
	} {
		t.Run(name, func(t *testing.T) {
			record := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/api/project", nil)
			req.Host = test.host
			for key, value := range test.headers {
				req.Header.Set(key, value)
			}
			server.ServeHTTP(record, req)
			if record.Code != http.StatusForbidden || strings.Contains(record.Body.String(), "schemaVersion") {
				t.Fatalf("status=%d body=%q", record.Code, record.Body.String())
			}
		})
	}
	if ok := request(server, http.MethodGet, "/api/project", nil, projectHeaders); ok.Code != http.StatusOK {
		t.Fatalf("allowed request refused: status=%d", ok.Code)
	}
}

func TestProjectFileDisabledByDefault(t *testing.T) {
	server := testAtlasServer(t)
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		if response := request(server, method, "/api/project", nil, nil); response.Code != http.StatusNotFound {
			t.Fatalf("%s /api/project without ATLAS_PROJECT_FILE: status=%d", method, response.Code)
		}
	}
}

func TestProjectFileServedReadOnlyAndRereadOnChange(t *testing.T) {
	file := filepath.Join(t.TempDir(), "project.json")
	if err := os.WriteFile(file, []byte(`{"schemaVersion":6,"title":"one"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	server := testAtlasServer(t)
	server.projectFile = file

	first := request(server, http.MethodGet, "/api/project", nil, projectHeaders)
	if first.Code != http.StatusOK || first.Body.String() != `{"schemaVersion":6,"title":"one"}` {
		t.Fatalf("first response: status=%d body=%q", first.Code, first.Body.String())
	}
	if contentType := first.Header().Get("Content-Type"); !strings.HasPrefix(contentType, "application/json") {
		t.Fatalf("content type: %q", contentType)
	}
	if first.Header().Get("Cache-Control") != "no-store" || first.Header().Get("Content-Security-Policy") == "" {
		t.Fatalf("headers: %v", first.Header())
	}
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("missing ETag")
	}
	if head := request(server, http.MethodHead, "/api/project", nil, projectHeaders); head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("ETag") != etag {
		t.Fatalf("HEAD: status=%d bodyLen=%d etag=%q", head.Code, head.Body.Len(), head.Header().Get("ETag"))
	}

	if err := os.WriteFile(file, []byte(`{"schemaVersion":6,"title":"two"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	second := request(server, http.MethodGet, "/api/project", nil, projectHeaders)
	if second.Code != http.StatusOK || !strings.Contains(second.Body.String(), `"two"`) || second.Header().Get("ETag") == etag {
		t.Fatalf("changed file not picked up: status=%d etag=%q body=%q", second.Code, second.Header().Get("ETag"), second.Body.String())
	}

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		response := request(server, method, "/api/project", []byte(`{}`), projectHeaders)
		if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != "GET, HEAD" {
			t.Fatalf("%s: status=%d allow=%q", method, response.Code, response.Header().Get("Allow"))
		}
	}
	if raw, err := os.ReadFile(file); err != nil || !strings.Contains(string(raw), `"two"`) {
		t.Fatalf("file was modified through the API: %v %q", err, raw)
	}
}

func TestProjectFileMissingAfterStartup(t *testing.T) {
	server := testAtlasServer(t)
	server.projectFile = filepath.Join(t.TempDir(), "gone.json")
	response := request(server, http.MethodGet, "/api/project", nil, projectHeaders)
	if response.Code != http.StatusServiceUnavailable || strings.Contains(response.Body.String(), "gone.json") {
		t.Fatalf("status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestProjectFileStartupValidation(t *testing.T) {
	public, err := fs.Sub(embeddedFiles, "public")
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	valid := filepath.Join(directory, "project.json")
	if err := os.WriteFile(valid, []byte(`{}`), 0o600); err != nil {
		t.Fatal(err)
	}
	for name, value := range map[string]string{
		"relative":  "project.json",
		"missing":   filepath.Join(directory, "missing.json"),
		"directory": directory,
	} {
		t.Run(name, func(t *testing.T) {
			t.Setenv("ATLAS_PROJECT_FILE", value)
			if _, err := newAtlasServer(public); err == nil {
				t.Fatalf("ATLAS_PROJECT_FILE=%q was accepted", value)
			}
		})
	}
	t.Setenv("ATLAS_PROJECT_FILE", valid)
	server, err := newAtlasServer(public)
	if err != nil || server.projectFile != valid {
		t.Fatalf("valid file rejected: server=%v err=%v", server, err)
	}
}

func TestProjectFileRefusalsAndErrorsAreNotCached(t *testing.T) {
	file := filepath.Join(t.TempDir(), "project.json")
	if err := os.WriteFile(file, []byte(`{}`), 0o600); err != nil {
		t.Fatal(err)
	}
	server := testAtlasServer(t)
	server.projectFile = file
	refused := request(server, http.MethodGet, "/api/project", nil, nil)
	if refused.Code != http.StatusForbidden || refused.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("refused request: status=%d cache=%q", refused.Code, refused.Header().Get("Cache-Control"))
	}
	server.projectFile = filepath.Join(t.TempDir(), "gone.json")
	gone := request(server, http.MethodGet, "/api/project", nil, projectHeaders)
	if gone.Code != http.StatusServiceUnavailable || gone.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unavailable file: status=%d cache=%q", gone.Code, gone.Header().Get("Cache-Control"))
	}
}
