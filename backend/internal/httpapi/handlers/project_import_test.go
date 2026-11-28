package handlers_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

// jsonFields returns the JSON properties of a struct type by name, with the fields of embedded structs.
func jsonFields(t reflect.Type) map[string]reflect.Type {
	out := map[string]reflect.Type{}
	for i := range t.NumField() {
		field := t.Field(i)
		name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		switch {
		case name == "-":
		case field.Anonymous && name == "":
			for n, ft := range jsonFields(field.Type) {
				out[n] = ft
			}
		case name != "":
			out[name] = field.Type
		}
	}
	return out
}

// nested returns the struct type that a field holds, directly or in a list or pointer, or nil for a
// value such as a string, a time, or raw JSON.
func nested(t reflect.Type) reflect.Type {
	for t.Kind() == reflect.Slice || t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct || t == reflect.TypeFor[time.Time]() {
		return nil
	}
	return t
}

// compareFields fails for every JSON property that the export has and the import does not know, which
// the import would reject with 422, and for every property that only the import has.
func compareFields(t *testing.T, path string, export, imported reflect.Type) {
	t.Helper()
	exportFields, importFields := jsonFields(export), jsonFields(imported)
	for name, exportField := range exportFields {
		importField, ok := importFields[name]
		if !ok {
			t.Errorf("%s.%s is exported but the import does not know it (add it to %s)", path, name, imported)
			continue
		}
		if e, i := nested(exportField), nested(importField); (e == nil) != (i == nil) {
			t.Errorf("%s.%s is a record in one of the documents and a value in the other", path, name)
		} else if e != nil {
			compareFields(t, path+"."+name, e, i)
		}
	}
	for name := range importFields {
		if _, ok := exportFields[name]; !ok {
			t.Errorf("%s.%s is only in the import: the export never writes it", path, name)
		}
	}
}

// TestImportTypesFollowExportTypes keeps the import in step with the export: a field that is added to
// the export must also be known to the import, otherwise an export would not import any more.
func TestImportTypesFollowExportTypes(t *testing.T) {
	compareFields(t, "document", reflect.TypeFor[handlers.ProjectExportBody](), reflect.TypeFor[handlers.ProjectImportBody]())
}

func importRequest(t *testing.T, store *fakeProjects, body string) *httptest.ResponseRecorder {
	t.Helper()
	manager, bearer := authtest.NewManagerAndToken(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects/import", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	httpapi.New(store, manager).ServeHTTP(rr, req)
	return rr
}

const minimalImport = `{"format_version":1,"project":{"name":"Imported"}}`

func TestImportProject(t *testing.T) {
	t.Run("minimal document: the caller becomes the owner", func(t *testing.T) {
		store := newFakeProjects(true)
		rr := importRequest(t, store, minimalImport)
		if rr.Code != http.StatusCreated {
			t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
		}
		var got handlers.TaraProjectBody
		if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil || got.Name != "Imported" || got.Role != db.ProjectRoleOWNER {
			t.Fatalf("body = %+v, %v", got, err)
		}
		if store.createdFor != testUUIDValue(t, authtest.UserID) {
			t.Fatalf("imported for %v, want the caller", store.createdFor)
		}
		if store.imported.FormatVersion != 1 || len(store.imported.Items) != 0 {
			t.Fatalf("store got %+v", store.imported)
		}
	})

	t.Run("fields only the server knows are optional, references are kept", func(t *testing.T) {
		store := newFakeProjects(true)
		rr := importRequest(t, store, `{
			"format_version": 1,
			"project": {"name": "P", "description": null},
			"items": [{
				"name": "ECU", "scope_type": "ITEM",
				"assets": [{"name": "Firmware", "cybersecurity_properties": [{"id": "p1", "property_type": "INTEGRITY"}]}],
				"damage_scenarios": [{"id": "d1", "title": "Blinding",
					"impact_ratings": [{"id": "r1", "impact_category": "SAFETY", "rating_value": "SEVERE"}],
					"asset_property_links": [{"asset_cybersecurity_property_id": "p1"}]}],
				"attack_paths": [{"id": "a1", "title": "Flash", "feasibility_rating": {"ap_total_score": 3, "feasibility_rating": "LOW"}}],
				"threat_scenarios": [{"title": "Spoofing",
					"damage_scenario_links": [{"damage_scenario_id": "d1"}],
					"attack_path_links": [{"attack_path_id": "a1"}],
					"risk_values": [{"id": "v1", "impact_rating_id": "r1", "risk_score": 4, "determination_method": "RISK_MATRIX"}],
					"risk_treatment_decisions": [{"risk_value_id": "v1", "treatment_option": "REDUCING"}]}]
			}]}`)
		if rr.Code != http.StatusCreated {
			t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
		}
		item := store.imported.Items[0]
		threat := item.ThreatScenarios[0]
		switch {
		case item.Params.Name != "ECU" || item.Assets[0].Properties[0].Key != "p1":
			t.Fatalf("item = %+v", item)
		case item.DamageScenarios[0].PropertyLinks[0].PropertyKey != "p1" || item.DamageScenarios[0].ImpactRatings[0].Key != "r1":
			t.Fatalf("damage scenario = %+v", item.DamageScenarios[0])
		case item.AttackPaths[0].Rating == nil || *item.AttackPaths[0].Rating.ApTotalScore != 3:
			t.Fatalf("attack path = %+v", item.AttackPaths[0])
		case threat.DamageScenarioKeys[0] != "d1" || threat.AttackPathKeys[0] != "a1" || threat.RiskValues[0].ImpactRatingKey != "r1" || threat.Decisions[0].RiskValueKey != "v1":
			t.Fatalf("threat scenario = %+v", threat)
		}
	})

	for name, tc := range map[string]struct{ body, want string }{
		"newer format version": {`{"format_version":2,"project":{"name":"P"}}`, "body.format_version"},
		"missing project name": {`{"format_version":1,"project":{}}`, "name"},
		"blank project name":   {`{"format_version":1,"project":{"name":"  "}}`, "name"},
		"unknown field":        {`{"format_version":1,"project":{"name":"P"},"members":[]}`, "members"},
		"unknown enum value":   {`{"format_version":1,"project":{"name":"P"},"items":[{"name":"I","scope_type":"BOTH"}]}`, "scope_type"},
		"missing reference":    {`{"format_version":1,"project":{"name":"P"},"items":[{"name":"I","scope_type":"ITEM","threat_scenarios":[{"title":"T","damage_scenario_links":[{}]}]}]}`, "damage_scenario_id"},
		"risk score too high":  {`{"format_version":1,"project":{"name":"P"},"items":[{"name":"I","scope_type":"ITEM","threat_scenarios":[{"title":"T","risk_values":[{"impact_rating_id":"r","risk_score":6,"determination_method":"RISK_MATRIX"}]}]}]}`, "risk_score"},
	} {
		t.Run("rejects "+name, func(t *testing.T) {
			store := newFakeProjects(true)
			rr := importRequest(t, store, tc.body)
			if rr.Code != http.StatusUnprocessableEntity || !strings.Contains(rr.Body.String(), tc.want) {
				t.Fatalf("status = %d, want 422 naming %q: %s", rr.Code, tc.want, rr.Body.String())
			}
			if store.createdFor.Valid {
				t.Fatal("the store was called for a rejected document")
			}
		})
	}

	t.Run("a broken reference found while importing is 422 with its place", func(t *testing.T) {
		store := newFakeProjects(true)
		store.importErr = &db.ImportError{Path: "items[0].threat_scenarios[2].damage_scenario_links[1].damage_scenario_id", Message: "no damage scenario"}
		rr := importRequest(t, store, minimalImport)
		if rr.Code != http.StatusUnprocessableEntity || !strings.Contains(rr.Body.String(), "body.items[0].threat_scenarios[2].damage_scenario_links[1].damage_scenario_id") {
			t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("an unexpected error is not shown", func(t *testing.T) {
		store := newFakeProjects(true)
		store.importErr = errors.New("connection reset: secret detail")
		rr := importRequest(t, store, minimalImport)
		if rr.Code != http.StatusInternalServerError || strings.Contains(rr.Body.String(), "secret detail") {
			t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("a document over the size limit is rejected", func(t *testing.T) {
		store := newFakeProjects(true)
		rr := importRequest(t, store, `{"format_version":1,"project":{"name":"`+strings.Repeat("a", 11*1024*1024)+`"}}`)
		if rr.Code != http.StatusRequestEntityTooLarge || store.createdFor.Valid {
			t.Fatalf("status = %d, want 413 and no import", rr.Code)
		}
	})

	t.Run("callers without a token are rejected", func(t *testing.T) {
		manager, _ := authtest.NewManagerAndToken(t)
		rr := httptest.NewRecorder()
		httpapi.New(newFakeProjects(true), manager).ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/v1/projects/import", strings.NewReader(minimalImport)))
		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", rr.Code)
		}
	})
}
