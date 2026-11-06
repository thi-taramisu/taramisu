package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

var errAcceptFailed = errors.New("accept failed")

// trackingListener reports when it is closed. If failAccept is set, every Accept after the first connection
// waits until failAccept is closed and then fails, so Serve stops while that connection's request runs.
type trackingListener struct {
	net.Listener
	failAccept chan struct{}
	accepted   atomic.Int32
	closed     chan struct{}
	closeOnce  sync.Once
}

func (l *trackingListener) Accept() (net.Conn, error) {
	if l.failAccept != nil && l.accepted.Load() >= 1 {
		<-l.failAccept
		return nil, errAcceptFailed
	}
	conn, err := l.Listener.Accept()
	if err == nil {
		l.accepted.Add(1)
	}
	return conn, err
}

func (l *trackingListener) Close() error {
	l.closeOnce.Do(func() { close(l.closed) })
	return l.Listener.Close()
}

// serving is serve running in the background with a handler that blocks until release is closed
// or its request context is cancelled.
type serving struct {
	cancel       context.CancelFunc
	url          string
	listener     *trackingListener
	started      chan struct{}
	release      chan struct{}
	canceled     chan struct{}
	shuttingDown chan struct{}
	served       chan error
}

func startServe(t *testing.T, timeout time.Duration, failAccept chan struct{}) *serving {
	t.Helper()
	inner, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s := &serving{
		url:          "http://" + inner.Addr().String(),
		listener:     &trackingListener{Listener: inner, failAccept: failAccept, closed: make(chan struct{})},
		started:      make(chan struct{}, 1),
		release:      make(chan struct{}),
		canceled:     make(chan struct{}, 1),
		shuttingDown: make(chan struct{}),
		served:       make(chan error, 1),
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
	server.RegisterOnShutdown(func() { close(s.shuttingDown) })
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	t.Cleanup(cancel)
	go func() { s.served <- serve(ctx, server, s.listener, timeout) }()
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

// assertStillServing fails if serve returns within a grace period after the given event.
func assertStillServing(t *testing.T, s *serving, after string) {
	t.Helper()
	select {
	case err := <-s.served:
		t.Fatalf("serve returned %v after %s although a request was still running", err, after)
	case <-time.After(200 * time.Millisecond):
	}
}

func TestServeDrainsInFlightRequestsBeforeReturning(t *testing.T) {
	s := startServe(t, 5*time.Second, nil)
	status := s.get()
	waitFor(t, s.started, "the request to reach the handler")

	s.cancel()
	waitFor(t, s.shuttingDown, "Shutdown to start")
	waitFor(t, s.listener.closed, "the listener to close, so no new connections are accepted")
	assertStillServing(t, s, "Shutdown started")

	close(s.release)
	if code := waitFor(t, status, "the in-flight response"); code != http.StatusNoContent {
		t.Fatalf("in-flight request: got status %d, want %d", code, http.StatusNoContent)
	}
	if err := waitFor(t, s.served, "serve to return"); err != nil {
		t.Fatalf("serve: %v", err)
	}
}

func TestServeDrainsInFlightRequestsWhenServeFails(t *testing.T) {
	failAccept := make(chan struct{})
	s := startServe(t, 5*time.Second, failAccept)
	status := s.get()
	waitFor(t, s.started, "the request to reach the handler")

	// Serve now stops with an Accept error while the request is still running.
	close(failAccept)
	waitFor(t, s.shuttingDown, "Shutdown to start after Serve failed")
	assertStillServing(t, s, "Serve failed")

	close(s.release)
	if code := waitFor(t, status, "the in-flight response"); code != http.StatusNoContent {
		t.Fatalf("in-flight request: got status %d, want %d", code, http.StatusNoContent)
	}
	if err := waitFor(t, s.served, "serve to return"); !errors.Is(err, errAcceptFailed) {
		t.Fatalf("serve: got %v, want %v", err, errAcceptFailed)
	}
}

func TestServeClosesConnectionsAfterShutdownTimeout(t *testing.T) {
	s := startServe(t, 50*time.Millisecond, nil)
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

type blockingCloser struct{ release chan struct{} }

func (c blockingCloser) Close() { <-c.release }

func TestClosePoolGivesUpAfterTimeout(t *testing.T) {
	pool := blockingCloser{release: make(chan struct{})}
	t.Cleanup(func() { close(pool.release) })

	returned := make(chan struct{})
	go func() {
		closePool(pool, 50*time.Millisecond)
		close(returned)
	}()
	waitFor(t, returned, "closePool to give up on a pool that does not close")
}

func TestClosePoolWaitsForPool(t *testing.T) {
	pool := blockingCloser{release: make(chan struct{})}
	returned := make(chan struct{})
	go func() {
		closePool(pool, 5*time.Second)
		close(returned)
	}()

	select {
	case <-returned:
		t.Fatal("closePool returned before the pool closed")
	case <-time.After(100 * time.Millisecond):
	}
	close(pool.release)
	waitFor(t, returned, "closePool to return once the pool closed")
}
