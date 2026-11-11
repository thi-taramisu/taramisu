// Command llm is the LLM service from the architecture overview: a thin forwarder between the API and an
// OpenAI-compatible model API (SAIA by GWDG). It holds the API key, so the key never reaches the API, and it is
// the only container with internet access for model requests (network llm-egress in deploy/compose.llm.yaml).
//
// It forwards only the endpoints the API needs and never logs request or response bodies. It has no
// authentication of its own: only the API can reach it, through the internal llm network.
package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const (
	defaultHTTPAddr    = ":8080"
	defaultUpstreamURL = "https://chat-ai.academiccloud.de"
	// maxRequestBytes bounds a chat request, including the conversation history and tool results.
	maxRequestBytes = 1 << 20
	shutdownTimeout = 8 * time.Second
)

func main() {
	if err := run(); err != nil {
		slog.Error("llm service stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	addr := envOr("HTTP_ADDR", defaultHTTPAddr)
	upstream, err := url.Parse(envOr("LLM_UPSTREAM_URL", defaultUpstreamURL))
	if err != nil || (upstream.Scheme != "http" && upstream.Scheme != "https") || upstream.Host == "" {
		return fmt.Errorf("invalid LLM_UPSTREAM_URL %q", os.Getenv("LLM_UPSTREAM_URL"))
	}
	apiKey := os.Getenv("LLM_API_KEY")
	if apiKey == "" {
		slog.Warn("LLM_API_KEY not set: the assistant is disabled and every model request returns 503")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	server := &http.Server{Handler: newHandler(upstream, apiKey), ReadHeaderTimeout: 5 * time.Second}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	slog.Info("llm service listening", "address", listener.Addr().String(), "upstream", upstream.Host)

	serveErr := make(chan error, 1)
	go func() { serveErr <- server.Serve(listener) }()
	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// newHandler forwards the allowed endpoints to upstream and adds the API key. Paths are kept as they are,
// so upstream is the base URL without /v1. Other paths get 404, other methods on an allowed path 405.
func newHandler(upstream *url.URL, apiKey string) http.Handler {
	proxy := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(upstream)
			// Only our key leaves the network; nothing the caller sent is passed on as credentials.
			r.Out.Header.Del("Cookie")
			r.Out.Header.Set("Authorization", "Bearer "+apiKey)
		},
		// Pass streamed (SSE) responses on immediately instead of buffering them.
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			slog.Error("model API request failed", "path", r.URL.Path, "error", err)
			http.Error(w, "model API unavailable", http.StatusBadGateway)
		},
	}

	forward := func(w http.ResponseWriter, r *http.Request) {
		if apiKey == "" {
			http.Error(w, "assistant is not configured", http.StatusServiceUnavailable)
			return
		}
		// Read the whole body first, so an oversized request is rejected before anything reaches the model API.
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRequestBytes))
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
				return
			}
			http.Error(w, "could not read request", http.StatusBadRequest)
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		proxy.ServeHTTP(rec, r)
		slog.Info("model request", "method", r.Method, "path", r.URL.Path, "status", rec.status,
			"duration", time.Since(start).Round(time.Millisecond))
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/chat/completions", forward)
	mux.HandleFunc("GET /v1/models", forward)
	return mux
}

// statusRecorder remembers the status code for the request log. Unwrap lets the proxy flush streamed responses.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
