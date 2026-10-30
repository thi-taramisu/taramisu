package handlers_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2/humatest"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const assetID = "00000000-0000-4000-8000-000000000001"
const itemID = "00000000-0000-4000-8000-000000000002"
const assetCollection = "/api/v1/item-definitions/" + itemID + "/assets"
const assetPath = assetCollection + "/" + assetID
const assetJSON = `{"name":"ECU"}`

// Only error paths need a stub; the PostgreSQL test exercises successful CRUD.
type assetStore struct {
	handlers.AssetStore
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
	cases := []struct{ method, path, body string }{
		{"GET", assetCollection + "/not-a-uuid", ""},
		{"GET", "/api/v1/item-definitions/bad/assets", ""},
		{"GET", assetCollection + "?limit=101", ""},
		{"GET", assetCollection + "?offset=2147483648", ""},
		{"GET", assetCollection + "?offset=4294967296", ""},
		{"POST", "/api/v1/item-definitions/urn:uuid:" + itemID + "/assets", assetJSON},
		{"POST", "/api/v1/item-definitions/{" + itemID + "}/assets", assetJSON},
		{"POST", "/api/v1/item-definitions/" + strings.ReplaceAll(itemID, "-", "") + "/assets", assetJSON},
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
			_, api := humatest.New(t)
			handlers.NewAssets(s).Register(api)
			r := api.Do(tc.method, tc.path, strings.NewReader(tc.body))
			if r.Code != 422 || s.calls != 0 {
				t.Fatalf("got %d, calls %d: %s", r.Code, s.calls, r.Body)
			}
		})
	}
}

func TestAssetErrors(t *testing.T) {
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
			_, api := humatest.New(t)
			handlers.NewAssets(s).Register(api)
			r := api.Do(tc.method, tc.path, strings.NewReader(assetJSON))
			if r.Code != tc.want || strings.Contains(r.Body.String(), "private database details") {
				t.Fatalf("got %d, want %d: %s", r.Code, tc.want, r.Body)
			}
		})
	}
}
