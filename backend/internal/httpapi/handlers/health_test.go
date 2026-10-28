package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

type statusReaderFunc func(context.Context) (string, error)

func (f statusReaderFunc) GetServiceStatus(ctx context.Context) (string, error) { return f(ctx) }

type healthQueries struct {
	statusReaderFunc
	handlers.AssetStore
}

func statusFunc(f func(context.Context) (string, error)) healthQueries {
	return healthQueries{statusReaderFunc: f}
}

func TestLiveness(t *testing.T) {
	h := httpapi.New(statusFunc(func(context.Context) (string, error) {
		t.Fatal("liveness must not query the database")
		return "", nil
	}), nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health/live", http.NoBody))
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "ok" {
		t.Errorf("status = %q, want ok", body.Status)
	}
}

func TestReadiness(t *testing.T) {
	for _, tc := range []struct {
		message string
		err     error
		code    int
	}{
		{"database reachable", nil, http.StatusOK},
		{"", errors.New("down"), http.StatusServiceUnavailable},
	} {
		h := httpapi.New(statusFunc(func(context.Context) (string, error) {
			return tc.message, tc.err
		}), nil)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health/ready", http.NoBody))
		if rr.Code != tc.code {
			t.Errorf("status = %d, want %d", rr.Code, tc.code)
		}
		if tc.code != http.StatusOK {
			continue
		}
		var body struct {
			Status  string `json:"status"`
			Message string `json:"message"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.Status != "ok" || body.Message != tc.message {
			t.Errorf("body = %+v, want status ok and message %q", body, tc.message)
		}
	}
}
