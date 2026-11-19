package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const exportProjectID = "5eed0000-0000-4000-8000-000000000001"

func TestProjectExportPostgres(t *testing.T) {
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
	queries := db.New(tx)
	fixture := authtest.NewFixture(t, queries)
	alice := "Bearer " + fixture.Token(t, nil)
	bob := "Bearer " + fixture.Token(t, map[string]any{"sub": "export-bob"})
	handler := httpapi.New(queries, fixture.Manager)
	get := func(bearer, id string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/projects/"+id+"/export", http.NoBody)
		req.Header.Set("Authorization", bearer)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		return rr
	}
	// The first request creates both users; bob loses the Owner role the fixture gives him.
	get(alice, exportProjectID)
	get(bob, exportProjectID)
	if _, err := tx.Exec(ctx, string(fixtureSQL)); err != nil {
		t.Fatalf("fixture: %v", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM project_role_assignment
		WHERE tara_project_id = $1 AND user_id = (SELECT id FROM iam_user WHERE external_iam_sub = 'export-bob')`, exportProjectID); err != nil {
		t.Fatal(err)
	}

	t.Run("owner gets the whole project", func(t *testing.T) {
		rr := get(alice, exportProjectID)
		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
		}
		if got := rr.Header().Get("Content-Disposition"); !strings.Contains(got, "attachment") || !strings.Contains(got, exportProjectID) {
			t.Fatalf("Content-Disposition = %q", got)
		}
		var doc handlers.ProjectExportBody
		if err := json.Unmarshal(rr.Body.Bytes(), &doc); err != nil {
			t.Fatal(err)
		}
		if doc.FormatVersion != handlers.ExportFormatVersion || doc.ExportedAt.IsZero() {
			t.Fatalf("format_version = %d, exported_at = %v", doc.FormatVersion, doc.ExportedAt)
		}
		if doc.Project.ID != exportProjectID || doc.Project.Name != "Smart headlamp (seed data)" {
			t.Fatalf("project = %+v", doc.Project)
		}
		if len(doc.Items) != 1 {
			t.Fatalf("items = %d, want 1", len(doc.Items))
		}
		item := doc.Items[0]
		if item.Name != "Adaptive headlamp ECU" || len(item.Assets) != 2 || len(item.DamageScenarios) != 2 ||
			len(item.ThreatScenarios) != 2 || len(item.AttackPaths) != 2 {
			t.Fatalf("item has %d assets, %d damage scenarios, %d threat scenarios, %d attack paths",
				len(item.Assets), len(item.DamageScenarios), len(item.ThreatScenarios), len(item.AttackPaths))
		}

		properties := 0
		for _, asset := range item.Assets {
			properties += len(asset.CybersecurityProperties)
		}
		if properties != 4 {
			t.Fatalf("asset properties = %d, want 4", properties)
		}
		var ratings, damageLinks int
		for _, damage := range item.DamageScenarios {
			ratings += len(damage.ImpactRatings)
			damageLinks += len(damage.AssetPropertyLinks)
		}
		if ratings != 4 || damageLinks != 2 {
			t.Fatalf("impact ratings = %d, damage property links = %d", ratings, damageLinks)
		}

		var propertyLinks, damageScenarioLinks, pathLinks, risks, decisions int
		for _, threat := range item.ThreatScenarios {
			propertyLinks += len(threat.AssetPropertyLinks)
			damageScenarioLinks += len(threat.DamageScenarioLinks)
			pathLinks += len(threat.AttackPathLinks)
			risks += len(threat.RiskValues)
			decisions += len(threat.RiskTreatmentDecisions)
		}
		if propertyLinks != 2 || damageScenarioLinks != 3 || pathLinks != 2 || risks != 3 || decisions != 2 {
			t.Fatalf("threat links: properties %d, damage %d, paths %d, risks %d, decisions %d",
				propertyLinks, damageScenarioLinks, pathLinks, risks, decisions)
		}

		var rated, unrated int
		for _, path := range item.AttackPaths {
			if path.FeasibilityRating != nil {
				rated++
			} else {
				unrated++
			}
		}
		if rated != 1 || unrated != 1 {
			t.Fatalf("attack paths with rating = %d, without = %d", rated, unrated)
		}
	})

	t.Run("references can be resolved inside the document", func(t *testing.T) {
		var doc handlers.ProjectExportBody
		if err := json.Unmarshal(get(alice, exportProjectID).Body.Bytes(), &doc); err != nil {
			t.Fatal(err)
		}
		item := doc.Items[0]
		ids := map[string]bool{}
		for _, asset := range item.Assets {
			for _, p := range asset.CybersecurityProperties {
				ids[p.ID] = true
			}
		}
		for _, damage := range item.DamageScenarios {
			ids[damage.ID] = true
			for _, rating := range damage.ImpactRatings {
				ids[rating.ID] = true
			}
		}
		for _, path := range item.AttackPaths {
			ids[path.ID] = true
		}
		for _, threat := range item.ThreatScenarios {
			for _, risk := range threat.RiskValues {
				ids[risk.ID] = true
			}
		}
		check := func(kind, id string) {
			t.Helper()
			if !ids[id] {
				t.Errorf("%s references %s, which is not in the export", kind, id)
			}
		}
		for _, damage := range item.DamageScenarios {
			for _, link := range damage.AssetPropertyLinks {
				check("damage property link", link.AssetCybersecurityPropertyID)
			}
		}
		for _, threat := range item.ThreatScenarios {
			for _, link := range threat.AssetPropertyLinks {
				check("threat property link", link.AssetCybersecurityPropertyID)
			}
			for _, link := range threat.DamageScenarioLinks {
				check("threat damage link", link.DamageScenarioID)
			}
			for _, link := range threat.AttackPathLinks {
				check("threat attack path link", link.AttackPathID)
			}
			for _, risk := range threat.RiskValues {
				check("risk value", risk.ImpactRatingID)
			}
			for _, decision := range threat.RiskTreatmentDecisions {
				if decision.RiskValueID != nil {
					check("treatment decision", *decision.RiskValueID)
				}
			}
		}
	})

	t.Run("empty project exports empty lists, not null", func(t *testing.T) {
		var id string
		if err := tx.QueryRow(ctx, `WITH p AS (INSERT INTO tara_project (name) VALUES ('Empty') RETURNING id),
			a AS (INSERT INTO project_role_assignment (tara_project_id, user_id, project_role)
			      SELECT p.id, u.id, 'OWNER' FROM p, iam_user u WHERE u.external_iam_sub <> 'export-bob' RETURNING 1)
			SELECT id::text FROM p`).Scan(&id); err != nil {
			t.Fatal(err)
		}
		rr := get(alice, id)
		if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"items":[]`) {
			t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("user without a role gets no data", func(t *testing.T) {
		rr := get(bob, exportProjectID)
		if rr.Code != http.StatusForbidden && rr.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 403 or 404: %s", rr.Code, rr.Body.String())
		}
		if strings.Contains(rr.Body.String(), "Adaptive headlamp") {
			t.Fatalf("response leaks project data: %s", rr.Body.String())
		}
	})

	t.Run("unknown project", func(t *testing.T) {
		rr := get(alice, "5eed0000-0000-4000-8000-0000000000ff")
		if rr.Code != http.StatusForbidden && rr.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 403 or 404", rr.Code)
		}
	})
}
