package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

// TestSearchPostgres checks the global search against the real query: only accessible projects,
// typo and accent tolerance, display IDs, literal wildcards, filters, and stable pages.
func TestSearchPostgres(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
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
	handler := httpapi.New(store, fixture.Manager)

	alice := "Bearer " + fixture.Token(t, nil)
	aliceInTeam := "Bearer " + fixture.Token(t, map[string]any{"taramisu_groups": []string{teamGroupID}})
	bob := "Bearer " + fixture.Token(t, map[string]any{"sub": "search-bob"})

	createProject := func(token, name string) string {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", strings.NewReader(`{"name":"`+name+`"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", token)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != http.StatusCreated {
			t.Fatalf("create project: %d %s", rr.Code, rr.Body)
		}
		var p struct{ ID string }
		if err := json.Unmarshal(rr.Body.Bytes(), &p); err != nil {
			t.Fatal(err)
		}
		return p.ID
	}

	// alice's project: TS-1 to TS-12, so that TS-1 also prefixes TS-10 to TS-12.
	vehicle := createProject(alice, "Vehicle Platform")
	headlamp := seedItem(t, ctx, tx, vehicle, "Headlamp")
	spoofed := seedThreatScenario(t, ctx, tx, headlamp, "Spoofed camera frames")
	threats := map[string]string{"TS-1": spoofed}
	// Titles sort in the opposite order of the numbers (TS-12 "Filler threat a", TS-2 "Filler threat k"),
	// so the display ID test sees whether ID matches are ordered by number.
	for n := 2; n <= 12; n++ {
		threats[fmt.Sprintf("TS-%d", n)] = seedThreatScenario(t, ctx, tx, headlamp, fmt.Sprintf("Filler threat %c", 'a'+12-n))
	}
	damage := seedDamageScenario(t, ctx, tx, headlamp, "Schäden am Fahrzeug")
	literal := seedAsset(t, ctx, tx, headlamp, "Port a_c")
	seedAsset(t, ctx, tx, headlamp, "Port abc")
	replay := seedAttackPath(t, ctx, tx, headlamp, "Replay via OBD")

	// alice's project for the ranking of names: the scores tie or favour the wrong match.
	ranking := createProject(alice, "Ranking checks")
	sensors := seedItem(t, ctx, tx, ranking, "Sensor cluster")
	absBrake := seedAsset(t, ctx, tx, sensors, "ABS brake")
	brake := seedAsset(t, ctx, tx, sensors, "Brake")
	lamInterface := seedAsset(t, ctx, tx, sensors, "Lam interface")
	headlamps := seedAsset(t, ctx, tx, sensors, "Headlamps")

	// bob's project, shared with the team group as Viewer.
	brakes := createProject(bob, "Brake System")
	brakeItem := seedItem(t, ctx, tx, brakes, "Brake controller")
	brakeThreat := seedThreatScenario(t, ctx, tx, brakeItem, "Spoofed brake signal")
	var groupID string
	if err := tx.QueryRow(ctx, `INSERT INTO iam_group (external_iam_group_id) VALUES ($1) RETURNING id::text`, teamGroupID).Scan(&groupID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO project_role_assignment (tara_project_id, group_id, project_role) VALUES ($1, $2, 'VIEWER')`, brakes, groupID); err != nil {
		t.Fatal(err)
	}

	// bob's private project, whose names match alice's searches.
	secret := createProject(bob, "Spoofed secrets")
	secretItem := seedItem(t, ctx, tx, secret, "Spoofed camera frames secret")
	secretThreat := seedThreatScenario(t, ctx, tx, secretItem, "Spoofed camera frames")

	// The helpers take the subtest's t, so that a failure stops only that subtest.
	search := func(t *testing.T, token string, params url.Values) searchPage {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/search?"+params.Encode(), http.NoBody)
		req.Header.Set("Authorization", token)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("search %s: %d %s", params.Encode(), rr.Code, rr.Body)
		}
		var page searchPage
		if err := json.Unmarshal(rr.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
		return page
	}
	ids := func(page searchPage) []string {
		out := make([]string, 0, len(page.Results))
		for _, r := range page.Results {
			out = append(out, r.ID)
		}
		return out
	}
	contains := func(page searchPage, id string) bool {
		for _, got := range ids(page) {
			if got == id {
				return true
			}
		}
		return false
	}
	q := func(query string, more ...string) url.Values {
		v := url.Values{"q": {query}}
		for i := 0; i+1 < len(more); i += 2 {
			v.Add(more[i], more[i+1])
		}
		return v
	}

	t.Run("only accessible projects", func(t *testing.T) {
		page := search(t, alice, q("spoofed"))
		if !contains(page, spoofed) {
			t.Errorf("own threat scenario missing: %v", ids(page))
		}
		for _, foreign := range []string{brakeThreat, secret, secretItem, secretThreat} {
			if contains(page, foreign) {
				t.Errorf("result %s from a project without a role: %v", foreign, ids(page))
			}
		}
		if page := search(t, aliceInTeam, q("spoofed")); !contains(page, brakeThreat) || contains(page, secretThreat) {
			t.Errorf("with the team group: %v", ids(page))
		}
		if page := search(t, alice, q("spoofed", "project_id", secret)); len(page.Results) != 0 || page.Total != 0 {
			t.Errorf("explicit project without a role returned %v", ids(page))
		}
		if page := search(t, aliceInTeam, q("spoofed", "project_id", brakes)); !contains(page, brakeThreat) || contains(page, spoofed) {
			t.Errorf("project filter: %v", ids(page))
		}
	})

	t.Run("result fields", func(t *testing.T) {
		page := search(t, alice, q("spoofed camera", "type", "threat-scenarios"))
		if len(page.Results) != 1 {
			t.Fatalf("results = %v", ids(page))
		}
		r := page.Results[0]
		if r.ID != spoofed || r.Name != "Spoofed camera frames" || r.Project.ID != vehicle || r.Project.Name != "Vehicle Platform" ||
			r.Item == nil || r.Item.ID != headlamp || r.Item.Name != "Headlamp" {
			t.Errorf("result = %+v", r)
		}
		// Every type has its own branch in the query: check its type value, display ID, and item.
		for _, tc := range []struct{ query, resultType, id, displayID string }{
			{"vehicle", "projects", vehicle, ""},
			{"headlamp", "items", headlamp, "IT-1"},
			{"a_c", "assets", literal, "AS-1"},
			{"schäden", "damage-scenarios", damage, "DS-1"},
			{"spoofed camera", "threat-scenarios", spoofed, "TS-1"},
			{"replay", "attack-paths", replay, "AP-1"},
		} {
			page := search(t, alice, q(tc.query, "type", tc.resultType))
			if len(page.Results) != 1 {
				t.Errorf("%s: results = %v", tc.resultType, ids(page))
				continue
			}
			r := page.Results[0]
			gotDisplayID := ""
			if r.DisplayID != nil {
				gotDisplayID = *r.DisplayID
			}
			// Projects and items have no item; all other elements belong to the headlamp.
			wantItem := tc.resultType != "projects" && tc.resultType != "items"
			if r.ID != tc.id || r.Type != tc.resultType || gotDisplayID != tc.displayID || (r.Item != nil) != wantItem ||
				wantItem && r.Item.ID != headlamp {
				t.Errorf("%s: result = %+v, display_id = %q", tc.resultType, r, gotDisplayID)
			}
		}
	})

	t.Run("typos, accents, and short queries", func(t *testing.T) {
		for query, want := range map[string]string{"spofed": spoofed, "schaden": damage, "He": headlamp, "obd": replay} {
			if page := search(t, alice, q(query)); !contains(page, want) {
				t.Errorf("%q: %v", query, ids(page))
			}
		}
	})

	t.Run("display IDs", func(t *testing.T) {
		page := search(t, alice, q("TS-1"))
		// The exact ID first, then the IDs starting with it by number; not TS-2.
		want := []string{threats["TS-1"], threats["TS-10"], threats["TS-11"], threats["TS-12"]}
		if got := ids(page); strings.Join(got, ",") != strings.Join(want, ",") {
			t.Fatalf("TS-1 = %v, want %v", got, want)
		}
		for _, query := range []string{"ts12", "TS 12", "ts-012"} {
			if page := search(t, alice, q(query)); len(page.Results) == 0 || page.Results[0].ID != threats["TS-12"] {
				t.Errorf("%q = %v", query, ids(page))
			}
		}
	})

	t.Run("exact names, then substrings, then similar names", func(t *testing.T) {
		for _, tc := range []struct {
			query string
			want  []string
		}{
			// Both have word similarity 1; the exact name comes first although "ABS brake" sorts before it.
			{"brake", []string{brake, absBrake}},
			// "Lam interface" is more similar (0.6) than "Headlamps" (0.4), but only "Headlamps" contains the query.
			{"lamp", []string{headlamps, lamInterface}},
		} {
			page := search(t, alice, q(tc.query, "project_id", ranking, "type", "assets"))
			if got := ids(page); strings.Join(got, ",") != strings.Join(tc.want, ",") {
				t.Errorf("%q = %v, want %v", tc.query, got, tc.want)
			}
		}
	})

	t.Run("wildcards are literal", func(t *testing.T) {
		if page := search(t, alice, q("a_c")); len(page.Results) != 1 || page.Results[0].ID != literal {
			t.Errorf("a_c = %v", ids(page))
		}
		// unaccent maps full-width characters to ASCII; they must not become wildcards either.
		for _, query := range []string{"%", "％", "﹪"} {
			if page := search(t, alice, q(query)); len(page.Results) != 0 {
				t.Errorf("%q = %v", query, ids(page))
			}
		}
		// The handler rejects lone accents; the query must not match everything either, should a query that
		// unaccent empties get through.
		var aliceID pgtype.UUID
		if err := tx.QueryRow(ctx, `SELECT id FROM iam_user WHERE external_iam_sub = $1`, authtest.Subject).Scan(&aliceID); err != nil {
			t.Fatal(err)
		}
		rows, err := db.New(tx).SearchElements(ctx, db.SearchElementsParams{
			UserID: aliceID, GroupIds: []string{}, ProjectIds: []pgtype.UUID{}, Types: []string{},
			Query: "\u0301", PageLimit: 100,
		})
		if err != nil || len(rows) != 0 {
			t.Errorf("lone accent: %d rows, err %v", len(rows), err)
		}
		for _, query := range []string{"＿", "a＿c"} {
			if page := search(t, alice, q(query)); len(page.Results) != 1 || page.Results[0].ID != literal {
				t.Errorf("%q = %v", query, ids(page))
			}
		}
	})

	t.Run("type filter", func(t *testing.T) {
		if page := search(t, alice, q("spoofed", "type", "projects", "type", "items")); len(page.Results) != 0 {
			t.Errorf("projects and items = %v", ids(page))
		}
		if page := search(t, alice, q("head", "type", "items")); len(page.Results) != 1 || page.Results[0].ID != headlamp {
			t.Errorf("items = %v", ids(page))
		}
	})

	t.Run("stable pages", func(t *testing.T) {
		seen := map[string]bool{}
		offset := "0"
		for pages := 0; offset != ""; pages++ {
			if pages > 3 {
				t.Fatal("too many pages")
			}
			page := search(t, alice, q("filler", "type", "threat-scenarios", "limit", "5", "offset", offset))
			if page.Total != 11 {
				t.Fatalf("total = %d", page.Total)
			}
			for _, id := range ids(page) {
				if seen[id] {
					t.Fatalf("%s on two pages", id)
				}
				seen[id] = true
			}
			offset = ""
			if page.NextOffset != nil {
				offset = strconv.FormatInt(*page.NextOffset, 10)
			}
		}
		if len(seen) != 11 {
			t.Errorf("pages returned %d of 11 results", len(seen))
		}
	})
}
