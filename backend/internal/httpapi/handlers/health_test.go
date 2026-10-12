package handlers_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

type statusFunc func(context.Context) (string, error)

func (f statusFunc) GetServiceStatus(ctx context.Context) (string, error) { return f(ctx) }

func TestReadiness(t *testing.T) {
	for _, tc := range []struct {
		err  error
		code int
	}{
		{nil, http.StatusOK},
		{errors.New("down"), http.StatusServiceUnavailable},
	} {
		h := httpapi.New(statusFunc(func(context.Context) (string, error) { return "ok", tc.err }))
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest("GET", "/health/ready", nil))
		if rr.Code != tc.code {
			t.Errorf("status = %d, want %d", rr.Code, tc.code)
		}
	}
}
