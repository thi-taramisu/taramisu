package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"sort"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/logging"
)

// fullItem maps each table that holds content of an item definition to the ID of the row that
// newFullItem created in it, including the item definition itself.
type fullItem map[string]string

// newFullItem creates an item definition with one row in every table below it: asset, cybersecurity
// property, damage scenario, impact rating, threat scenario, attack path with its feasibility
// rating, the property assignments and links between them, a risk value, and a treatment decision
// that refers to the risk value. TestItemDefinitionDeleteCascadePostgres compares these tables with
// the database catalog.
func newFullItem(t *testing.T, ctx context.Context, q db.DBTX, projectID, name string) fullItem {
	t.Helper()
	item := fullItem{}
	insert := func(table, columns, values string, args ...any) string {
		t.Helper()
		var id string
		if err := q.QueryRow(ctx, "INSERT INTO "+table+" ("+columns+") VALUES ("+values+") RETURNING id::text", args...).Scan(&id); err != nil {
			t.Fatalf("insert %s: %v", table, err)
		}
		item[table] = id
		return id
	}
	// Elements with display numbers are created with their create queries.
	element := func(table, id string) string {
		item[table] = id
		return id
	}
	itemID := element("item_definition", seedItem(t, ctx, q, projectID, name))
	asset := element("asset", seedAsset(t, ctx, q, itemID, "Asset"))
	property := insert("asset_cybersecurity_property", "asset_id, property_type", "$1, 'INTEGRITY'", asset)
	damage := element("damage_scenario", seedDamageScenario(t, ctx, q, itemID, "Damage"))
	insert("damage_scenario_asset_property", "damage_scenario_id, asset_cybersecurity_property_id", "$1, $2", damage, property)
	impact := insert("impact_rating", "damage_scenario_id, impact_category, rating_value", "$1, 'SAFETY', 'MAJOR'", damage)
	threat := element("threat_scenario", seedThreatScenario(t, ctx, q, itemID, "Threat"))
	insert("threat_scenario_asset_property", "threat_scenario_id, asset_cybersecurity_property_id", "$1, $2", threat, property)
	insert("threat_damage_link", "threat_scenario_id, damage_scenario_id", "$1, $2", threat, damage)
	path := element("attack_path", seedAttackPath(t, ctx, q, itemID, "Path"))
	insert("threat_attack_path_link", "threat_scenario_id, attack_path_id", "$1, $2", threat, path)
	insert("attack_feasibility_rating", "attack_path_id, feasibility_rating", "$1, 'LOW'", path)
	risk := insert("risk_value", "threat_scenario_id, impact_rating_id, risk_score, determination_method", "$1, $2, 3, 'RISK_MATRIX'", threat, impact)
	insert("risk_treatment_decision", "threat_scenario_id, risk_value_id, treatment_option", "$1, $2, 'REDUCING'", threat, risk)
	return item
}

// remaining returns the tables in which the item's row still exists, sorted by name.
func (item fullItem) remaining(t *testing.T, ctx context.Context, q db.DBTX) []string {
	t.Helper()
	var tables []string
	for table, id := range item {
		var exists bool
		if err := q.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM "+table+" WHERE id = $1)", id).Scan(&exists); err != nil {
			t.Fatalf("look up %s: %v", table, err)
		}
		if exists {
			tables = append(tables, table)
		}
	}
	sort.Strings(tables)
	return tables
}

// tables returns every table the item has a row in, sorted by name.
func (item fullItem) tables() []string {
	tables := make([]string, 0, len(item))
	for table := range item {
		tables = append(tables, table)
	}
	sort.Strings(tables)
	return tables
}

// TestItemDefinitionDeleteCascadePostgres checks that an Editor, but not a Viewer, can delete an item
// definition, and that the deletion removes all its content, including a treatment decision that
// refers to a risk value (risk_treatment_decision_risk_threat_fk is ON DELETE NO ACTION), leaves
// other items of the project alone, and records one audit event for the item, none for the rows
// deleted by cascade.
func TestItemDefinitionDeleteCascadePostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
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
	handler := httpapi.New(store, fixture.Manager)
	call := func(token, method, path string, want int) map[string]any {
		t.Helper()
		req := httptest.NewRequest(method, path, http.NoBody)
		req.Header.Set("Authorization", token)
		req.Header.Set(logging.RequestIDHeader, "req-"+method)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		var out map[string]any
		if rr.Body.Len() > 0 {
			if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
				t.Fatal(err)
			}
		}
		return out
	}

	ownerID, err := store.UpsertIAMUser(ctx, authtest.Subject)
	if err != nil {
		t.Fatal(err)
	}
	project, err := store.CreateTaraProject(ctx, db.CreateTaraProjectParams{Name: "Item deletion", OwnerID: mustUUID(ownerID)})
	if err != nil {
		t.Fatal(err)
	}
	projectID := project.ID.String()
	member := func(subject string, role db.ProjectRole) (id, token string) {
		t.Helper()
		id, err := store.UpsertIAMUser(ctx, subject)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO project_role_assignment (tara_project_id, user_id, project_role) VALUES ($1, $2, $3)`, projectID, id, role); err != nil {
			t.Fatal(err)
		}
		return id, "Bearer " + fixture.Token(t, map[string]any{"sub": subject})
	}
	editorID, editor := member("item-delete-editor", db.ProjectRoleEDITOR)
	_, viewer := member("item-delete-viewer", db.ProjectRoleVIEWER)

	deleted := newFullItem(t, ctx, tx, projectID, "Deleted")
	kept := newFullItem(t, ctx, tx, projectID, "Kept")
	// The fixture must cover every table that refers to an item definition, directly or through
	// other tables; a table added later without a fixture row fails here.
	rows, err := tx.Query(ctx, `
		WITH RECURSIVE below(t) AS (
			SELECT 'item_definition'::regclass
			UNION
			SELECT c.conrelid::regclass FROM pg_constraint c JOIN below ON c.confrelid = below.t WHERE c.contype = 'f'
		)
		SELECT t::text FROM below ORDER BY t::text COLLATE "C"`)
	if err != nil {
		t.Fatal(err)
	}
	below, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(below, deleted.tables()) {
		t.Fatalf("tables below item_definition = %v, but the fixture fills %v", below, deleted.tables())
	}
	path := "/api/v1/projects/" + projectID + "/item-definitions/" + deleted["item_definition"]
	before := call(editor, http.MethodGet, path, http.StatusOK)

	call(viewer, http.MethodDelete, path, http.StatusForbidden)
	if got := deleted.remaining(t, ctx, tx); !reflect.DeepEqual(got, deleted.tables()) {
		t.Fatalf("after a refused deletion, rows remain in %v, want all of %v", got, deleted.tables())
	}

	call(editor, http.MethodDelete, path, http.StatusNoContent)
	if got := deleted.remaining(t, ctx, tx); len(got) != 0 {
		t.Fatalf("deleted item still has rows in %v", got)
	}
	if got := kept.remaining(t, ctx, tx); !reflect.DeepEqual(got, kept.tables()) {
		t.Fatalf("the other item has rows in %v, want all of %v", got, kept.tables())
	}
	call(editor, http.MethodGet, path, http.StatusNotFound)

	want := []storedEvent{{editorID, "item_definition.deleted", db.TargetItemDefinition, deleted["item_definition"], before, nil, "req-DELETE"}}
	if got := auditEvents(t, ctx, tx, projectID); !reflect.DeepEqual(got, want) {
		t.Fatalf("audit history:\n got %+v\nwant %+v", got, want)
	}
}
