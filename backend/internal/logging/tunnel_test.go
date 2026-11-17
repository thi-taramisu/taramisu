package logging

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
)

func TestTunnelLogDelivery(t *testing.T) {
	payload := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/42/envelope/" || !strings.Contains(r.Header.Get("X-Sentry-Auth"), "public") {
			t.Errorf("unexpected ingest request: %s %s", r.Method, r.URL)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		payload <- string(body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	transport, err := NewTunnelTransport(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	logger, flush, err := New(sentry.ClientOptions{Dsn: "https://public@o1.ingest.de.sentry.io/42", HTTPTransport: transport}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	logger.Error("tunnel delivery check")
	if !flush(5 * time.Second) {
		t.Fatal("flush timed out")
	}
	select {
	case body := <-payload:
		if !strings.Contains(body, "tunnel delivery check") || !strings.Contains(body, "https://public@o1.ingest.de.sentry.io/42") || !strings.Contains(body, `"sentry.environment":{"value":"development"`) {
			t.Fatalf("original DSN, environment, or event missing: %s", body)
		}
	default:
		t.Fatal("no event reached the internal ingest endpoint")
	}
}

func TestInvalidTunnelOrigin(t *testing.T) {
	for _, origin := range []string{"", "://invalid", "file:///tmp/tunnel", "http://", "http://user:pass@proxy", "http://proxy/path", "http://proxy?target=external", "http://proxy#fragment"} {
		if _, err := NewTunnelTransport(origin); err == nil {
			t.Errorf("accepted invalid origin %q", origin)
		}
	}
}

func TestPanicRequestPrivacy(t *testing.T) {
	var payload bytes.Buffer
	_, flush, err := New(sentry.ClientOptions{
		Dsn: "https://public@example.com/1",
		HTTPTransport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			_, err := io.Copy(&payload, r.Body)
			if err != nil {
				return nil, err
			}
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("{}"))}, nil
		}),
	}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	handler := sentryhttp.New(sentryhttp.Options{}).Handle(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
		}
		if len(body) == 0 {
			t.Error("request body missing")
		}
		panic("request privacy check")
	}))
	request := httptest.NewRequest(http.MethodPost, "https://app.example/api/v1/me?token=private-query", strings.NewReader(`{"password":"private-body"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer private-token")
	request.Header.Set("Cookie", "session=private-cookie")
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if !flush(5 * time.Second) {
		t.Fatal("flush timed out")
	}
	body := payload.String()
	if !strings.Contains(body, "request privacy check") || !strings.Contains(body, "/api/v1/me") {
		t.Fatalf("panic or route context missing: %s", body)
	}
	for _, secret := range []string{"private-query", "private-body", "private-token", "private-cookie"} {
		if strings.Contains(body, secret) {
			t.Errorf("request secret leaked: %s", secret)
		}
	}
}
