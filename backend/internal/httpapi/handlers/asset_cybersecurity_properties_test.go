package handlers_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humatest"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

// propertyErrorStore is a fake database shared by property and link handler tests.
// Each method counts calls and returns the configured error without accessing PostgreSQL.
type propertyErrorStore struct {
	err   error
	calls int
}

// CreateAssetCybersecurityProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) CreateAssetCybersecurityProperty(context.Context, db.CreateAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error) {
	s.calls++
	return db.AssetCybersecurityProperty{}, s.err
}

// GetAssetCybersecurityProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) GetAssetCybersecurityProperty(context.Context, db.GetAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error) {
	s.calls++
	return db.AssetCybersecurityProperty{}, s.err
}

// ListAssetCybersecurityProperties records a fake database call and returns the configured error.
func (s *propertyErrorStore) ListAssetCybersecurityProperties(context.Context, db.ListAssetCybersecurityPropertiesParams) ([]db.AssetCybersecurityProperty, error) {
	s.calls++
	return nil, s.err
}

// ReplaceAssetCybersecurityProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) ReplaceAssetCybersecurityProperty(context.Context, db.ReplaceAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error) {
	s.calls++
	return db.AssetCybersecurityProperty{}, s.err
}

// UpdateAssetCybersecurityProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) UpdateAssetCybersecurityProperty(context.Context, db.UpdateAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error) {
	s.calls++
	return db.AssetCybersecurityProperty{}, s.err
}

// DeleteAssetCybersecurityProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) DeleteAssetCybersecurityProperty(context.Context, db.DeleteAssetCybersecurityPropertyParams) (pgtype.UUID, error) {
	s.calls++
	return pgtype.UUID{}, s.err
}

// CreateDamageScenarioAssetProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) CreateDamageScenarioAssetProperty(context.Context, db.CreateDamageScenarioAssetPropertyParams) (db.DamageScenarioAssetProperty, error) {
	s.calls++
	return db.DamageScenarioAssetProperty{}, s.err
}

// GetDamageScenarioAssetProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) GetDamageScenarioAssetProperty(context.Context, db.GetDamageScenarioAssetPropertyParams) (db.DamageScenarioAssetProperty, error) {
	s.calls++
	return db.DamageScenarioAssetProperty{}, s.err
}

// ListDamageScenarioAssetProperties records a fake database call and returns the configured error.
func (s *propertyErrorStore) ListDamageScenarioAssetProperties(context.Context, db.ListDamageScenarioAssetPropertiesParams) ([]db.DamageScenarioAssetProperty, error) {
	s.calls++
	return nil, s.err
}

// ReplaceDamageScenarioAssetProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) ReplaceDamageScenarioAssetProperty(context.Context, db.ReplaceDamageScenarioAssetPropertyParams) (db.DamageScenarioAssetProperty, error) {
	s.calls++
	return db.DamageScenarioAssetProperty{}, s.err
}

// UpdateDamageScenarioAssetProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) UpdateDamageScenarioAssetProperty(context.Context, db.UpdateDamageScenarioAssetPropertyParams) (db.DamageScenarioAssetProperty, error) {
	s.calls++
	return db.DamageScenarioAssetProperty{}, s.err
}

// DeleteDamageScenarioAssetProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) DeleteDamageScenarioAssetProperty(context.Context, db.DeleteDamageScenarioAssetPropertyParams) (pgtype.UUID, error) {
	s.calls++
	return pgtype.UUID{}, s.err
}

// CreateThreatScenarioAssetProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) CreateThreatScenarioAssetProperty(context.Context, db.CreateThreatScenarioAssetPropertyParams) (db.ThreatScenarioAssetProperty, error) {
	s.calls++
	return db.ThreatScenarioAssetProperty{}, s.err
}

// GetThreatScenarioAssetProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) GetThreatScenarioAssetProperty(context.Context, db.GetThreatScenarioAssetPropertyParams) (db.ThreatScenarioAssetProperty, error) {
	s.calls++
	return db.ThreatScenarioAssetProperty{}, s.err
}

// ListThreatScenarioAssetProperties records a fake database call and returns the configured error.
func (s *propertyErrorStore) ListThreatScenarioAssetProperties(context.Context, db.ListThreatScenarioAssetPropertiesParams) ([]db.ThreatScenarioAssetProperty, error) {
	s.calls++
	return nil, s.err
}

// ReplaceThreatScenarioAssetProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) ReplaceThreatScenarioAssetProperty(context.Context, db.ReplaceThreatScenarioAssetPropertyParams) (db.ThreatScenarioAssetProperty, error) {
	s.calls++
	return db.ThreatScenarioAssetProperty{}, s.err
}

// UpdateThreatScenarioAssetProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) UpdateThreatScenarioAssetProperty(context.Context, db.UpdateThreatScenarioAssetPropertyParams) (db.ThreatScenarioAssetProperty, error) {
	s.calls++
	return db.ThreatScenarioAssetProperty{}, s.err
}

// DeleteThreatScenarioAssetProperty records a fake database call and returns the configured error.
func (s *propertyErrorStore) DeleteThreatScenarioAssetProperty(context.Context, db.DeleteThreatScenarioAssetPropertyParams) (pgtype.UUID, error) {
	s.calls++
	return pgtype.UUID{}, s.err
}

// propertyRouteCase describes one resource so the same assertions can exercise all three APIs.
type propertyRouteCase struct {
	name, collection, member, body string
	register                       func(huma.API)
}

// propertyRouteCases builds valid example requests and registration functions for properties and both link types.
func propertyRouteCases(s *propertyErrorStore) []propertyRouteCase {
	root := "/api/v1/item-definitions/" + itemID
	propertyCollection := root + "/assets/" + assetID + "/cybersecurity-properties"
	return []propertyRouteCase{
		{"property", propertyCollection, propertyCollection + "/" + assetID, `{"property_type":"INTEGRITY"}`, handlers.NewAssetCybersecurityProperties(s).Register},
		{"damage", root + "/damage-scenario-asset-properties", root + "/damage-scenario-asset-properties/" + assetID,
			`{"damage_scenario_id":"` + assetID + `","asset_cybersecurity_property_id":"` + assetID + `"}`, handlers.NewDamageScenarioAssetProperties(s).Register},
		{"threat", root + "/threat-scenario-asset-properties", root + "/threat-scenario-asset-properties/" + assetID,
			`{"threat_scenario_id":"` + assetID + `","asset_cybersecurity_property_id":"` + assetID + `"}`, handlers.NewThreatScenarioAssetProperties(s).Register},
	}
}

// TestAssetCybersecurityPropertyErrors verifies database-to-HTTP error mapping for every operation.
// It also checks that internal database error details are not returned to clients.
func TestAssetCybersecurityPropertyErrors(t *testing.T) {
	for _, dbError := range []struct {
		name   string
		err    error
		status int
	}{
		{"missing", pgx.ErrNoRows, 404},
		{"duplicate", &pgconn.PgError{Code: "23505"}, 409},
		{"deleted reference", &pgconn.PgError{Code: "23503"}, 422},
		{"unavailable", errors.New("private database details"), 503},
		{"unknown SQL error", &pgconn.PgError{Code: "XX000", Message: "private database details"}, 503},
	} {
		for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE", "LIST"} {
			s := &propertyErrorStore{err: dbError.err}
			for _, route := range propertyRouteCases(s) {
				t.Run(dbError.name+"/"+method+"/"+route.name, func(t *testing.T) {
					_, api := humatest.New(t)
					route.register(api)
					path, actualMethod := route.member, method
					if method == "POST" || method == "LIST" {
						path = route.collection
					}
					if method == "LIST" {
						actualMethod = "GET"
					}
					s.calls = 0
					response := api.Do(actualMethod, path, strings.NewReader(route.body))
					if response.Code != dbError.status || s.calls != 1 || strings.Contains(response.Body.String(), "private database details") {
						t.Fatalf("got %d, calls %d: %s", response.Code, s.calls, response.Body)
					}
				})
			}
		}
	}
}

// TestAssetCybersecurityPropertyValidation checks invalid bodies, IDs, enums, and pagination.
// Invalid requests must be rejected before any database method is called.
func TestAssetCybersecurityPropertyValidation(t *testing.T) {
	s := &propertyErrorStore{}
	for _, route := range propertyRouteCases(s) {
		cases := []struct{ method, path, body string }{
			{"POST", route.collection, "{}"},
			{"POST", route.collection, "null"},
			{"POST", route.collection, `{"unexpected":true}`},
			{"POST", route.collection, `{`},
			{"PUT", route.member, "{}"},
			{"GET", strings.Replace(route.collection, itemID, "bad-id", 1), ""},
			{"GET", route.member + "-bad", ""},
			{"GET", route.collection + "?limit=0", ""},
			{"GET", route.collection + "?limit=101", ""},
			{"GET", route.collection + "?offset=-1", ""},
			{"GET", route.collection + "?offset=2147483648", ""},
			{"PATCH", route.member, `{"id":"` + assetID + `"}`},
			{"PATCH", route.member, `{"item_definition_id":"` + itemID + `"}`},
		}
		if route.name == "property" {
			cases = append(cases,
				struct{ method, path, body string }{"POST", route.collection, `{"property_type":"INVALID"}`},
				struct{ method, path, body string }{"PATCH", route.member, `{"property_type":"INVALID"}`},
				struct{ method, path, body string }{"PATCH", route.member, `{"property_type":null}`},
				struct{ method, path, body string }{"POST", route.collection, `{"property_type":null}`})
		} else {
			field := route.name + "_scenario_id"
			for _, body := range []string{
				`{"` + field + `":null}`,
				`{"asset_cybersecurity_property_id":null}`,
				`{"` + field + `":"bad"}`,
				`{"asset_cybersecurity_property_id":"bad"}`,
				`{"asset_cybersecurity_property_id":123}`,
			} {
				cases = append(cases, struct{ method, path, body string }{"PATCH", route.member, body})
			}
		}
		for _, tc := range cases {
			t.Run(route.name+"/"+tc.method+tc.path+tc.body, func(t *testing.T) {
				_, api := humatest.New(t)
				route.register(api)
				s.calls = 0
				response := api.Do(tc.method, tc.path, strings.NewReader(tc.body))
				want := 422
				if tc.body == "{" {
					want = 400
				}
				if response.Code != want {
					t.Fatalf("got %d, calls %d: %s", response.Code, s.calls, response.Body)
				}
				if s.calls != 0 {
					t.Fatal("invalid request reached the database")
				}
			})
		}
	}
}
