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

type statusFunc func(context.Context) (string, error)

type healthStore struct {
	handlers.StatusReader
	handlers.ItemDefinitionStore
}

func (f statusFunc) GetServiceStatus(ctx context.Context) (string, error) { return f(ctx) }

func TestReadiness(t *testing.T) {
	for _, tc := range []struct {
		message string
		err     error
		code    int
	}{
		{"database reachable", nil, http.StatusOK},
		{"", errors.New("down"), http.StatusServiceUnavailable},
	} {
		h := httpapi.New(healthStore{StatusReader: statusFunc(func(context.Context) (string, error) {
			return tc.message, tc.err
		})}, nil)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest("GET", "/health/ready", nil))
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
