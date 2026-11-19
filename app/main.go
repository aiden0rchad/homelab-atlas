package main

import (
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"time"
)

//go:embed public
var embeddedFiles embed.FS

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	public, err := fs.Sub(embeddedFiles, "public")
	if err != nil {
		return errors.New("embedded public files are unavailable")
	}
	if len(arguments) > 0 {
		switch arguments[0] {
		case "healthcheck":
			if len(arguments) != 1 {
				return errors.New("usage: atlas healthcheck")
			}
			return healthcheck()
		}
	}
	flags := flag.NewFlagSet("atlas", flag.ContinueOnError)
	host := flags.String("host", environmentDefault("HOST", "127.0.0.1"), "listen host")
	port := flags.String("port", environmentDefault("PORT", "8080"), "listen port")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return errors.New("usage: atlas [--host HOST] [--port PORT]")
	}
	address, err := listenAddress(*host, *port)
	if err != nil {
		return err
	}
	return serve(address, public)
}

func environmentDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func healthcheck() error {
	port := environmentDefault("PORT", "8080")
	address, err := listenAddress("127.0.0.1", port)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 2 * time.Second, Transport: &http.Transport{Proxy: nil}}
	response, err := client.Get("http://" + address + "/healthz")
	if err != nil {
		return errors.New("healthcheck failed")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return errors.New("healthcheck failed")
	}
	return nil
}
