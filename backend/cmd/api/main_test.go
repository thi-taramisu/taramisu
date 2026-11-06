package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"testing"
	"time"
)

// serving is serve running in the background with a handler that blocks until release is closed
// or its request context is cancelled.
type serving struct {
	cancel   context.CancelFunc
	addr     string
	url      string
	started  chan struct{}
	release  chan struct{}
	canceled chan struct{}
	served   chan error
}

func startServe(t *testing.T, timeout time.Duration) *serving {
	t.Helper()
	s := &serving{
		started:  make(chan struct{}, 1),
		release:  make(chan struct{}),
		canceled: make(chan struct{}, 1),
		served:   make(chan error, 1),
	}
	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			s.started <- struct{}{}
			select {
			case <-s.release:
				w.WriteHeader(http.StatusNoContent)
			case <-r.Context().Done():
				s.canceled <- struct{}{}
			}
		}),
		ReadHeaderTimeout: time.Second,
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s.addr = listener.Addr().String()
	s.url = "http://" + s.addr
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	t.Cleanup(cancel)
	go func() { s.served <- serve(ctx, server, listener, timeout) }()
	return s
}

// get sends a request in the background and delivers its status code (0 on a transport error).
func (s *serving) get() <-chan int {
	status := make(chan int, 1)
	go func() {
		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, s.url, http.NoBody)
		if err != nil {
			status <- 0
			return
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			status <- 0
			return
		}
		_ = resp.Body.Close()
		status <- resp.StatusCode
	}()
	return status
}

func waitFor[T any](t *testing.T, ch <-chan T, what string) T {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(5 * time.Second):
		t.Fatalf("timed out waiting for %s", what)
		panic("unreachable")
	}
}

func TestServeDrainsInFlightRequestsBeforeReturning(t *testing.T) {
	s := startServe(t, 5*time.Second)
	status := s.get()
	waitFor(t, s.started, "the request to reach the handler")

	s.cancel()
	select {
	case err := <-s.served:
		t.Fatalf("serve returned before the in-flight request finished: %v", err)
	case <-time.After(200 * time.Millisecond):
	}
	if conn, err := net.DialTimeout("tcp", s.addr, time.Second); err == nil {
		_ = conn.Close()
		t.Fatal("serve still accepted new connections after shutdown started")
	}

	close(s.release)
	if code := waitFor(t, status, "the in-flight response"); code != http.StatusNoContent {
		t.Fatalf("in-flight request: got status %d, want %d", code, http.StatusNoContent)
	}
	if err := waitFor(t, s.served, "serve to return"); err != nil {
		t.Fatalf("serve: %v", err)
	}
}

func TestServeClosesConnectionsAfterShutdownTimeout(t *testing.T) {
	s := startServe(t, 50*time.Millisecond)
	t.Cleanup(func() { close(s.release) })
	status := s.get()
	waitFor(t, s.started, "the request to reach the handler")

	s.cancel()
	if err := waitFor(t, s.served, "serve to return"); err != nil {
		t.Fatalf("serve: got %v, want nil for a planned stop", err)
	}
	waitFor(t, s.canceled, "the stuck handler's request context to be cancelled")
	if code := waitFor(t, status, "the cut-off response"); code != 0 {
		t.Fatalf("cut-off request: got status %d, want a transport error", code)
	}
}

func TestServeReturnsListenerError(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}

	err = serve(context.Background(), &http.Server{ReadHeaderTimeout: time.Second}, listener, time.Second)
	if err == nil || errors.Is(err, http.ErrServerClosed) {
		t.Fatalf("serve: got %v, want the listener error", err)
	}
}
