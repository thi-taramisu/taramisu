package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

// canonicalExport turns an export into a string that is the same for two exports of the same content.
// A copy has new IDs, times, and versions, and the export lists links and risk values by ID, so the
// order changes too. Records that others refer to get a name made of their place in the document;
// all other IDs are dropped, and lists are sorted after that.
func canonicalExport(t *testing.T, raw []byte) string {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	list := func(v any) []map[string]any {
		out := make([]map[string]any, 0, len(v.([]any)))
		for _, e := range v.([]any) {
			out = append(out, e.(map[string]any))
		}
		return out
	}
	sorted := func(v any, field string) []map[string]any {
		out := list(v)
		sort.Slice(out, func(i, j int) bool { return fmt.Sprint(out[i][field]) < fmt.Sprint(out[j][field]) })
		return out
	}
	labels := map[string]string{}
	label := func(record map[string]any, name string) { labels[record["id"].(string)] = name }
	for _, item := range sorted(doc["items"], "name") {
		in := fmt.Sprint(item["name"])
		for _, asset := range sorted(item["assets"], "name") {
			for _, property := range sorted(asset["cybersecurity_properties"], "property_type") {
				label(property, in+"/asset "+fmt.Sprint(asset["name"])+"/"+fmt.Sprint(property["property_type"]))
			}
		}
		for _, damage := range sorted(item["damage_scenarios"], "title") {
			dn := in + "/damage " + fmt.Sprint(damage["title"])
			label(damage, dn)
			for _, rating := range sorted(damage["impact_ratings"], "impact_category") {
				label(rating, dn+"/"+fmt.Sprint(rating["impact_category"]))
			}
		}
		for _, path := range sorted(item["attack_paths"], "title") {
			label(path, in+"/attack path "+fmt.Sprint(path["title"]))
		}
		for _, threat := range sorted(item["threat_scenarios"], "title") {
			for _, risk := range list(threat["risk_values"]) {
				label(risk, in+"/threat "+fmt.Sprint(threat["title"])+"/risk of "+labels[risk["impact_rating_id"].(string)])
			}
		}
	}
	var normalize func(any) any
	normalize = func(v any) any {
		switch x := v.(type) {
		case map[string]any:
			out := map[string]any{}
			for key, value := range x {
				switch s, isString := value.(string); {
				case key == "exported_at" || key == "created_at" || key == "version":
				case (key == "id" || strings.HasSuffix(key, "_id")) && isString:
					if name, ok := labels[s]; ok {
						out[key] = name
					}
				default:
					out[key] = normalize(value)
				}
			}
			return out
		case []any:
			out := make([]any, len(x))
			for i := range x {
				out[i] = normalize(x[i])
			}
			sort.Slice(out, func(i, j int) bool {
				a, _ := json.Marshal(out[i])
				b, _ := json.Marshal(out[j])
				return string(a) < string(b)
			})
			return out
		}
		return v
	}
	out, err := json.Marshal(normalize(doc))
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
}

func TestProjectImportPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
	}
	fixtureSQL, err := os.ReadFile("testdata/project_export.sql")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := tx.Rollback(ctx); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
			t.Error(err)
		}
	}()
	store := db.NewStore(tx)
	fixture := authtest.NewFixture(t, store)
	alice := "Bearer " + fixture.Token(t, nil)
	bob := "Bearer " + fixture.Token(t, map[string]any{"sub": "import-bob"})
	handler := httpapi.New(store, fixture.Manager)
	send := func(bearer, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", bearer)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		return rr
	}
	// The first request creates both users; bob loses the Owner role the fixture gives him.
	send(alice, http.MethodGet, "/api/v1/projects/"+exportProjectID+"/export", "")
	send(bob, http.MethodGet, "/api/v1/projects/"+exportProjectID+"/export", "")
	if _, err := tx.Exec(ctx, string(fixtureSQL)); err != nil {
		t.Fatalf("fixture: %v", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM project_role_assignment
		WHERE tara_project_id = $1 AND user_id = (SELECT id FROM iam_user WHERE external_iam_sub = 'import-bob')`, exportProjectID); err != nil {
		t.Fatal(err)
	}
	importDoc := func(bearer, body string) (int, string, string) {
		rr := send(bearer, http.MethodPost, "/api/v1/projects/import", body)
		var created struct{ ID string }
		_ = json.Unmarshal(rr.Body.Bytes(), &created)
		return rr.Code, created.ID, rr.Body.String()
	}
	export := func(bearer, id string) []byte {
		t.Helper()
		rr := send(bearer, http.MethodGet, "/api/v1/projects/"+id+"/export", "")
		if rr.Code != http.StatusOK {
			t.Fatalf("export of %s: status %d: %s", id, rr.Code, rr.Body.String())
		}
		return rr.Body.Bytes()
	}
	projectsNamed := func(prefix string) (n int) {
		t.Helper()
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM tara_project WHERE name LIKE $1`, prefix+"%").Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	t.Run("an export imports again without loss", func(t *testing.T) {
		original := export(alice, exportProjectID)
		code, id, body := importDoc(alice, string(original))
		if code != http.StatusCreated || id == "" || id == exportProjectID {
			t.Fatalf("status = %d, id = %q: %s", code, id, body)
		}
		if got, want := canonicalExport(t, export(alice, id)), canonicalExport(t, original); got != want {
			t.Fatalf("the copy differs from the original\n got: %s\nwant: %s", got, want)
		}
		// Content is part of the one import event, not audited record by record.
		rows, err := tx.Query(ctx, `SELECT event, after->>'format_version' FROM audit_event WHERE tara_project_id = $1`, id)
		if err != nil {
			t.Fatal(err)
		}
		events, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (string, error) {
			var event string
			var format *string
			err := r.Scan(&event, &format)
			return event + " format " + *format, err
		})
		if err != nil || len(events) != 1 || events[0] != "project.imported format 1" {
			t.Fatalf("audit events = %v, %v", events, err)
		}
	})

	t.Run("the importer is the owner, others have no access", func(t *testing.T) {
		code, id, body := importDoc(bob, `{"format_version":1,"project":{"name":"import-owner"}}`)
		if code != http.StatusCreated {
			t.Fatalf("status = %d: %s", code, body)
		}
		if rr := send(bob, http.MethodGet, "/api/v1/projects/"+id, ""); rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"role":"OWNER"`) {
			t.Fatalf("owner: status = %d: %s", rr.Code, rr.Body.String())
		}
		if rr := send(alice, http.MethodGet, "/api/v1/projects/"+id, ""); rr.Code != http.StatusNotFound {
			t.Fatalf("other user: status = %d, want 404", rr.Code)
		}
	})

	t.Run("a document without ids, times and versions imports", func(t *testing.T) {
		code, id, body := importDoc(alice, `{
			"format_version": 1,
			"project": {"name": "import-minimal"},
			"items": [{
				"name": "ECU", "scope_type": "ITEM",
				"assets": [{"name": "Firmware", "cybersecurity_properties": [{"id": "p1", "property_type": "INTEGRITY"}]}],
				"damage_scenarios": [{"id": "d1", "title": "Blinding",
					"impact_ratings": [{"id": "r1", "impact_category": "SAFETY", "rating_value": "SEVERE"}],
					"asset_property_links": [{"asset_cybersecurity_property_id": "p1"}]}],
				"attack_paths": [{"id": "a1", "title": "Flash", "feasibility_rating": {"feasibility_rating": "LOW"}}],
				"threat_scenarios": [{"title": "Spoofing",
					"asset_property_links": [{"asset_cybersecurity_property_id": "p1"}],
					"damage_scenario_links": [{"damage_scenario_id": "d1"}],
					"attack_path_links": [{"attack_path_id": "a1"}],
					"risk_values": [{"id": "v1", "impact_rating_id": "r1", "risk_score": 4, "determination_method": "RISK_MATRIX"}],
					"risk_treatment_decisions": [{"risk_value_id": "v1", "treatment_option": "REDUCING"}]}]
			}]}`)
		if code != http.StatusCreated {
			t.Fatalf("status = %d: %s", code, body)
		}
		var doc struct {
			Items []struct {
				Assets []struct {
					CybersecurityProperties []any `json:"cybersecurity_properties"`
				} `json:"assets"`
				DamageScenarios []struct {
					ImpactRatings      []any `json:"impact_ratings"`
					AssetPropertyLinks []any `json:"asset_property_links"`
				} `json:"damage_scenarios"`
				AttackPaths []struct {
					FeasibilityRating any `json:"feasibility_rating"`
				} `json:"attack_paths"`
				ThreatScenarios []struct {
					DamageScenarioLinks    []any `json:"damage_scenario_links"`
					AttackPathLinks        []any `json:"attack_path_links"`
					RiskValues             []any `json:"risk_values"`
					RiskTreatmentDecisions []any `json:"risk_treatment_decisions"`
				} `json:"threat_scenarios"`
			}
		}
		if err := json.Unmarshal(export(alice, id), &doc); err != nil {
			t.Fatal(err)
		}
		item, threat := doc.Items[0], doc.Items[0].ThreatScenarios[0]
		if len(item.Assets[0].CybersecurityProperties) != 1 || len(item.DamageScenarios[0].ImpactRatings) != 1 ||
			len(item.DamageScenarios[0].AssetPropertyLinks) != 1 || item.AttackPaths[0].FeasibilityRating == nil ||
			len(threat.DamageScenarioLinks) != 1 || len(threat.AttackPathLinks) != 1 ||
			len(threat.RiskValues) != 1 || len(threat.RiskTreatmentDecisions) != 1 {
			t.Fatalf("the copy misses records: %+v", doc)
		}
	})

	const prefix = `{"format_version":1,"project":{"name":"import-fail"},"items":[`
	const item = `{"name":"I","scope_type":"ITEM"`
	for name, tc := range map[string]struct{ items, where string }{
		"a key used twice": {
			item + `,"assets":[{"name":"A","cybersecurity_properties":[{"id":"x","property_type":"INTEGRITY"},{"id":"x","property_type":"AVAILABILITY"}]}]}`,
			"body.items[0].assets[0].cybersecurity_properties[1].id",
		},
		"a reference to nothing": {
			item + `,"threat_scenarios":[{"title":"T","damage_scenario_links":[{"damage_scenario_id":"nowhere"}]}]}`,
			"body.items[0].threat_scenarios[0].damage_scenario_links[0].damage_scenario_id",
		},
		"a reference into another item": {
			item + `,"assets":[{"name":"A","cybersecurity_properties":[{"id":"p","property_type":"INTEGRITY"}]}]},` +
				item + `,"threat_scenarios":[{"title":"T","asset_property_links":[{"asset_cybersecurity_property_id":"p"}]}]}`,
			"body.items[1].threat_scenarios[0].asset_property_links[0].asset_cybersecurity_property_id",
		},
		"a decision on a risk value of another threat scenario": {
			item + `,"damage_scenarios":[{"id":"d","title":"D","impact_ratings":[{"id":"r","impact_category":"SAFETY","rating_value":"SEVERE"}]}],` +
				`"threat_scenarios":[{"title":"T1","risk_values":[{"id":"v","impact_rating_id":"r","risk_score":2,"determination_method":"RISK_MATRIX"}]},` +
				`{"title":"T2","risk_treatment_decisions":[{"risk_value_id":"v","treatment_option":"REDUCING"}]}]}`,
			"body.items[0].threat_scenarios[1].risk_treatment_decisions[0].risk_value_id",
		},
		"the same property type twice on an asset": {
			item + `,"assets":[{"name":"A","cybersecurity_properties":[{"property_type":"INTEGRITY"},{"property_type":"INTEGRITY"}]}]}`,
			"body.items[0].assets[0].cybersecurity_properties[1]",
		},
		"an omitted rating that has a value": {
			item + `,"damage_scenarios":[{"title":"D","impact_ratings":[{"impact_category":"SAFETY","rating_value":"OMITTED","is_omitted_by_pm_15_07":false}]}]}`,
			"body.items[0].damage_scenarios[0].impact_ratings[0]",
		},
	} {
		t.Run("rejects "+name+" and creates nothing", func(t *testing.T) {
			code, _, body := importDoc(alice, prefix+tc.items+`]}`)
			if code != http.StatusUnprocessableEntity || !strings.Contains(body, tc.where) {
				t.Fatalf("status = %d, want 422 at %q: %s", code, tc.where, body)
			}
			if n := projectsNamed("import-fail"); n != 0 {
				t.Fatalf("%d projects were left behind", n)
			}
		})
	}
}
