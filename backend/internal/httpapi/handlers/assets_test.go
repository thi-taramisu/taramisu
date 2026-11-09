package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const assetID = "00000000-0000-4000-8000-000000000001"
const assetItemID = "00000000-0000-4000-8000-000000000002"
const assetCollection = "/api/v1/item-definitions/" + assetItemID + "/assets"
const assetPath = assetCollection + "/" + assetID
const assetJSON = `{"name":"ECU"}`

// Only error paths need a stub; the PostgreSQL test exercises successful CRUD.
type assetStore struct {
	handlers.AssetStore
	handlers.TaraProjectStore
	handlers.StatusReader
	resourceAccess
	handlers.ProjectMemberStore
	handlers.ItemDefinitionStore
	handlers.AssetCybersecurityPropertyStore
	handlers.DamagePropertyLinkStore
	handlers.ThreatPropertyLinkStore
	err   error
	calls int
}

func (s *assetStore) GetAsset(context.Context, db.GetAssetParams) (db.Asset, error) {
	s.calls++
	return db.Asset{}, s.err
}
func (s *assetStore) CreateAsset(context.Context, db.CreateAssetParams) (db.Asset, error) {
	s.calls++
	return db.Asset{}, s.err
}
func (s *assetStore) DeleteAsset(context.Context, db.DeleteAssetParams) (pgtype.UUID, error) {
	s.calls++
	return pgtype.UUID{}, s.err
}

func TestAssetValidation(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	cases := []struct{ method, path, body string }{
		{"GET", assetCollection + "/not-a-uuid", ""},
		{"GET", "/api/v1/item-definitions/bad/assets", ""},
		{"GET", assetCollection + "?limit=101", ""},
		{"GET", assetCollection + "?offset=2147483648", ""},
		{"GET", assetCollection + "?offset=4294967296", ""},
		{"POST", "/api/v1/item-definitions/urn:uuid:" + assetItemID + "/assets", assetJSON},
		{"POST", "/api/v1/item-definitions/{" + assetItemID + "}/assets", assetJSON},
		{"POST", "/api/v1/item-definitions/" + strings.ReplaceAll(assetItemID, "-", "") + "/assets", assetJSON},
		{"GET", assetCollection + "/urn:uuid:" + assetID, ""},
		{"GET", assetCollection + "/{" + assetID + "}", ""},
		{"POST", assetCollection, `{}`},
		{"PATCH", assetPath, `{"name":null}`},
		{"PATCH", assetPath, `{"name":"  "}`},
		{"PATCH", assetPath, `{"identification_source":"unknown"}`},
		{"POST", assetCollection, `{"name":"ECU","identification_source":"null"}`},
		{"PUT", assetPath, `{"name":"ECU","identification_source":"unknown"}`},
	}
	for _, tc := range cases {
		t.Run(tc.method+tc.path+tc.body, func(t *testing.T) {
			s := &assetStore{}
			h := httpapi.New(s, manager)
			r := assetRequest(t, h, bearer, tc.method, tc.path, strings.NewReader(tc.body))
			if r.Code != 422 || s.calls != 0 {
				t.Fatalf("got %d, calls %d: %s", r.Code, s.calls, r.Body)
			}
		})
	}
}

func TestAssetErrors(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	for _, tc := range []struct {
		name, method, path string
		err                error
		want               int
	}{
		{"missing", "GET", assetPath, pgx.ErrNoRows, 404},
		{"unavailable", "GET", assetPath, errors.New("private database details"), 503},
		{"unknown parent", "POST", assetCollection, &pgconn.PgError{Code: "23503"}, 422},
		{"missing delete", "DELETE", assetPath, pgx.ErrNoRows, 404},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := &assetStore{err: tc.err}
			h := httpapi.New(s, manager)
			r := assetRequest(t, h, bearer, tc.method, tc.path, strings.NewReader(assetJSON))
			if r.Code != tc.want || strings.Contains(r.Body.String(), "private database details") {
				t.Fatalf("got %d, want %d: %s", r.Code, tc.want, r.Body)
			}
		})
	}
}

func assetRequest(t testing.TB, h http.Handler, bearer string, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	reader, ok := body.(io.Reader)
	if !ok && body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = strings.NewReader(string(data))
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", bearer)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func (s *assetStore) ListAssets(context.Context, db.ListAssetsParams) ([]db.Asset, error) {
	s.calls++
	return nil, s.err
}
func (s *assetStore) ReplaceAsset(context.Context, db.ReplaceAssetParams) (db.Asset, error) {
	s.calls++
	return db.Asset{}, s.err
}
func (s *assetStore) UpdateAsset(context.Context, db.UpdateAssetParams) (db.Asset, error) {
	s.calls++
	return db.Asset{}, s.err
}
