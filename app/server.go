package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"
)

const securityPolicy = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"

type atlasServer struct {
	assets      map[string]staticAsset
	assetPrefix string
}

type staticAsset struct {
	contentType string
	raw         staticRepresentation
	compressed  staticRepresentation
}

type staticRepresentation struct {
	data []byte
	etag string
}

func newAtlasServer(public fs.FS) (*atlasServer, error) {
	assets, assetPrefix, err := loadStaticAssets(public)
	if err != nil {
		return nil, err
	}
	return &atlasServer{assets: assets, assetPrefix: assetPrefix}, nil
}

func loadStaticAssets(public fs.FS) (map[string]staticAsset, string, error) {
	fingerprint, err := staticAssetFingerprint(public)
	if err != nil {
		return nil, "", fmt.Errorf("could not fingerprint embedded assets: %w", err)
	}
	assetPrefix := "/assets/" + fingerprint + "/"
	assets := make(map[string]staticAsset)
	var writer *gzip.Writer
	err = fs.WalkDir(public, ".", func(name string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		data, err := fs.ReadFile(public, name)
		if err != nil {
			return err
		}
		var replacements [][2]string
		switch name {
		case "index.html":
			replacements = [][2]string{
				{`href="/styles.css"`, `href="` + assetPrefix + `styles.css"`},
				{`src="/app.js"`, `src="` + assetPrefix + `app.js"`},
			}
		case "dashboard.html":
			replacements = [][2]string{
				{`href="/dashboard.css"`, `href="` + assetPrefix + `dashboard.css"`},
				{`src="/dashboard.js"`, `src="` + assetPrefix + `dashboard.js"`},
			}
		}
		for _, replacement := range replacements {
			if bytes.Count(data, []byte(replacement[0])) != 1 {
				return fmt.Errorf("%s must contain exactly one %s", name, replacement[0])
			}
			data = bytes.Replace(data, []byte(replacement[0]), []byte(replacement[1]), 1)
		}
		contentType := mime.TypeByExtension(path.Ext(name))
		if contentType == "" {
			contentType = http.DetectContentType(data)
		}
		asset := staticAsset{contentType: contentType, raw: makeRepresentation(data)}
		if compressible(contentType) {
			var buffer bytes.Buffer
			if writer == nil {
				writer = gzip.NewWriter(&buffer)
			} else {
				writer.Reset(&buffer)
			}
			if _, err := writer.Write(data); err != nil {
				return err
			}
			if err := writer.Close(); err != nil {
				return err
			}
			if buffer.Len() < len(data) {
				asset.compressed = makeRepresentation(buffer.Bytes())
			}
		}
		assets[name] = asset
		return nil
	})
	if err != nil {
		return nil, "", fmt.Errorf("could not prepare embedded assets: %w", err)
	}
	return assets, assetPrefix, nil
}

func staticAssetFingerprint(public fs.FS) (string, error) {
	var names []string
	if err := fs.WalkDir(public, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && (path.Ext(name) == ".js" || path.Ext(name) == ".css") {
			names = append(names, name)
		}
		return nil
	}); err != nil {
		return "", err
	}
	sort.Strings(names)
	digest := sha256.New()
	for _, name := range names {
		data, err := fs.ReadFile(public, name)
		if err != nil {
			return "", err
		}
		fmt.Fprintf(digest, "%d:%s:%d:", len(name), name, len(data))
		if _, err := digest.Write(data); err != nil {
			return "", err
		}
	}
	return fmt.Sprintf("%x", digest.Sum(nil))[:16], nil
}

func makeRepresentation(data []byte) staticRepresentation {
	digest := sha256.Sum256(data)
	return staticRepresentation{data: data, etag: fmt.Sprintf(`"%x"`, digest)}
}

func compressible(contentType string) bool {
	mediaType, _, _ := mime.ParseMediaType(contentType)
	return strings.HasPrefix(mediaType, "text/") || mediaType == "application/javascript" || mediaType == "application/json" || mediaType == "image/svg+xml"
}

func (server *atlasServer) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	setSecurityHeaders(writer.Header())
	if request.URL.Path == "/healthz" {
		serveHealth(writer, request)
		return
	}
	server.serveStatic(writer, request)
}

func setSecurityHeaders(header http.Header) {
	header.Set("Content-Security-Policy", securityPolicy)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
	header.Set("Cross-Origin-Resource-Policy", "same-origin")
}

func serveHealth(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		methodNotAllowed(writer, "GET, HEAD")
		return
	}
	writeBody(writer, request, http.StatusOK, "text/plain; charset=utf-8", []byte("ok\n"))
}

func (server *atlasServer) serveStatic(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		methodNotAllowed(writer, "GET, HEAD")
		return
	}
	if request.URL.RawPath != "" || strings.Contains(request.URL.EscapedPath(), "%2e") || strings.Contains(request.URL.EscapedPath(), "%2E") {
		http.NotFound(writer, request)
		return
	}
	cleaned := path.Clean(request.URL.Path)
	if request.URL.Path == "/dashboard/" {
		cleaned = "/dashboard"
	} else if cleaned != request.URL.Path || strings.Contains(cleaned, "\\") {
		http.NotFound(writer, request)
		return
	}
	name := strings.TrimPrefix(cleaned, "/")
	if strings.HasPrefix(cleaned, "/assets/") {
		if server.assetPrefix == "" || !strings.HasPrefix(cleaned, server.assetPrefix) {
			http.NotFound(writer, request)
			return
		}
		name = strings.TrimPrefix(cleaned, server.assetPrefix)
	}
	switch name {
	case "":
		name = "index.html"
	case "dashboard":
		name = "dashboard.html"
	}
	asset, ok := server.assets[name]
	if !ok {
		http.NotFound(writer, request)
		return
	}
	representation := asset.raw
	if len(asset.compressed.data) > 0 && acceptsGzip(request.Header.Get("Accept-Encoding")) {
		representation = asset.compressed
		writer.Header().Set("Content-Encoding", "gzip")
	}
	writer.Header().Set("Cache-Control", "no-cache")
	writer.Header().Set("Content-Type", asset.contentType)
	writer.Header().Set("Content-Length", strconv.Itoa(len(representation.data)))
	writer.Header().Set("ETag", representation.etag)
	writer.Header().Set("Vary", "Accept-Encoding")
	http.ServeContent(writer, request, name, time.Time{}, bytes.NewReader(representation.data))
}

func acceptsGzip(header string) bool {
	wildcard := false
	for _, item := range strings.Split(header, ",") {
		parts := strings.Split(item, ";")
		encoding := strings.ToLower(strings.TrimSpace(parts[0]))
		quality := 1.0
		for _, parameter := range parts[1:] {
			key, value, found := strings.Cut(strings.TrimSpace(parameter), "=")
			if !found || !strings.EqualFold(key, "q") {
				continue
			}
			parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
			if err != nil || parsed < 0 || parsed > 1 {
				quality = 0
			} else {
				quality = parsed
			}
		}
		if encoding == "gzip" {
			return quality > 0
		}
		if encoding == "*" {
			wildcard = quality > 0
		}
	}
	return wildcard
}

func methodNotAllowed(writer http.ResponseWriter, allow string) {
	writer.Header().Set("Allow", allow)
	http.Error(writer, "method not allowed", http.StatusMethodNotAllowed)
}

func writeBody(writer http.ResponseWriter, request *http.Request, status int, contentType string, data []byte) {
	writer.Header().Set("Content-Type", contentType)
	writer.Header().Set("Content-Length", strconv.Itoa(len(data)))
	writer.WriteHeader(status)
	if request.Method != http.MethodHead {
		_, _ = writer.Write(data)
	}
}

func serve(address string, public fs.FS) error {
	handler, err := newAtlasServer(public)
	if err != nil {
		return err
	}
	server := &http.Server{
		Addr:              address,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("Homelab Atlas: http://%s", address)
	return server.ListenAndServe()
}

func listenAddress(host, port string) (string, error) {
	value, err := strconv.Atoi(port)
	if err != nil || value < 0 || value > 65535 {
		return "", fmt.Errorf("PORT must be a number from 0 through 65535")
	}
	return net.JoinHostPort(host, strconv.Itoa(value)), nil
}
