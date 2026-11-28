package logging

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net/http"
	"strconv"
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
	}, &console, nil)
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

func TestAuditLogsStayLocal(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		t.Run(strconv.FormatBool(enabled), func(t *testing.T) {
			var console bytes.Buffer
			payloads := make(chan string, 10)
			options := sentry.ClientOptions{}
			if enabled {
				options.Dsn = "https://public@example.com/1"
				options.HTTPTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
					body, err := io.ReadAll(r.Body)
					if err != nil {
						return nil, err
					}
					payloads <- string(body)
					return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("{}"))}, nil
				})
			}
			logger, flush, err := New(options, &console, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer flush(time.Second)
			// Exercise the audit helper's record shape and derived loggers so adding
			// attributes or groups cannot bypass the remote filter.
			loggers := []*slog.Logger{
				logger,
				logger.With("component", "membership"),
				logger.WithGroup("request").With("operation", "update"),
				logger.With("component", "membership").WithGroup("request"),
			}
			for _, derived := range loggers {
				for _, level := range []slog.Level{slog.LevelInfo, slog.LevelWarn, slog.LevelError} {
					derived.Log(context.Background(), level, "audit",
						"event", "member.updated", "actor", "private-actor",
						"project", "private-project", "member", "private-member", "user", "private-user")
				}
			}
			logger.Info("ordinary application log")
			logger.Info("request", "actor", "private-request")
			logger.Warn("access denied", "actor", "private-denial")
			logger.Error("unexpected error", "error", "private-input")
			if !flush(5 * time.Second) {
				t.Fatal("Sentry flush timed out")
			}
			var remote strings.Builder
			for len(payloads) > 0 {
				remote.WriteString(<-payloads)
			}
			for _, expected := range []string{"audit", "member.updated", "private-actor", "private-project", "private-member", "private-user", "private-request", "private-denial", "private-input"} {
				if !strings.Contains(console.String(), expected) {
					t.Errorf("console missing audit data %q", expected)
				}
				if strings.Contains(remote.String(), expected) {
					t.Errorf("Sentry received audit data %q", expected)
				}
			}
			if count := strings.Count(console.String(), `"msg":"audit"`); count != len(loggers)*3 {
				t.Errorf("console contains %d audit records, want %d", count, len(loggers)*3)
			}
			if enabled && !strings.Contains(remote.String(), "ordinary application log") {
				t.Error("Sentry did not receive the ordinary application log")
			}
			if !enabled && remote.Len() != 0 {
				t.Error("Sentry received data while disabled")
			}
		})
	}
}

func TestLocalLogging(t *testing.T) {
	t.Setenv("SENTRY_DSN", "https://public@example.com/1")
	var output bytes.Buffer
	logger, flush, err := New(sentry.ClientOptions{}, &output, nil)
	if err != nil {
		t.Fatal(err)
	}
	logger.Info("local log")
	if !strings.Contains(output.String(), "local log") || !flush(time.Second) {
		t.Fatal("local logging failed")
	}
}

func TestInvalidDSN(t *testing.T) {
	if _, _, err := New(sentry.ClientOptions{Dsn: "invalid"}, io.Discard, nil); err == nil {
		t.Fatal("expected invalid DSN to fail")
	}
}
