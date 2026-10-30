package logging

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/getsentry/sentry-go"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSentryLogDelivery(t *testing.T) {
	var console bytes.Buffer
	payloads := make(chan string, 10)
	logger, flush, err := New(sentry.ClientOptions{
		Dsn:         "https://public@example.com/1",
		Environment: "test",
		Release:     "test-release",
		HTTPTransport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			body, err := io.ReadAll(r.Body)
			if err != nil {
				return nil, err
			}
			payloads <- string(body)
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("{}"))}, nil
		}),
	}, &console)
	if err != nil {
		t.Fatal(err)
	}
	defer flush(time.Second)
	logger = logger.With("service", "api").WithGroup("request")
	logger.Info("server started", "port", 8080)
	logger.Warn("database unavailable")
	logger.Error("server stopped")
	logger.Debug("ignored debug message")
	if !flush(5 * time.Second) {
		t.Fatal("Sentry flush timed out")
	}
	var remote strings.Builder
	for len(payloads) > 0 {
		remote.WriteString(<-payloads)
	}
	for name, output := range map[string]string{"console": console.String(), "Sentry": remote.String()} {
		for _, expected := range []string{"server started", "database unavailable", "server stopped", "api", "8080"} {
			if !strings.Contains(output, expected) {
				t.Errorf("%s missing %q: %s", name, expected, output)
			}
		}
		if strings.Contains(output, "ignored debug message") {
			t.Errorf("%s includes debug log", name)
		}
	}
	if !strings.Contains(remote.String(), "request.port") {
		t.Errorf("Sentry missing grouped attribute: %s", remote.String())
	}
}

func TestLocalLogging(t *testing.T) {
	t.Setenv("SENTRY_DSN", "https://public@example.com/1")
	var output bytes.Buffer
	logger, flush, err := New(sentry.ClientOptions{}, &output)
	if err != nil {
		t.Fatal(err)
	}
	logger.Info("local log")
	if !strings.Contains(output.String(), "local log") || !flush(time.Second) {
		t.Fatal("local logging failed")
	}
}

func TestInvalidDSN(t *testing.T) {
	if _, _, err := New(sentry.ClientOptions{Dsn: "invalid"}, io.Discard); err == nil {
		t.Fatal("expected invalid DSN to fail")
	}
}
