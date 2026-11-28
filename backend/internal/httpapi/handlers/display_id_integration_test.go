package handlers_test

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

// displayIDElement describes the API of one element type for TestDisplayIDsPostgres.
type displayIDElement struct {
	name, prefix string
	// collections are two collections in the first project (of two items, for elements of an item),
	// other is one in the second project.
	collections [2]string
	other       string
	body, patch map[string]any // valid create and PUT body, and a valid PATCH body
	next        int            // first number the test expects in the first project
	otherNext   int            // first number the test expects in the second project
}

// TestDisplayIDsPostgres checks for each element type with an API that display IDs are assigned per
// project and element type, returned by every read and write, never reused, and not set or changed by
// clients.
func TestDisplayIDsPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(ctx) })
	queries := db.NewStore(tx)
	fixture := authtest.NewFixture(t, queries)
	api := &routeAPI{t: t, handler: httpapi.New(queries, fixture.Manager), token: "Bearer " + fixture.Token(t, nil)}

	create := func(path string, body map[string]any) map[string]any {
		t.Helper()
		return propertyResponse(t, api.Post(path, body), 201)
	}
	wantID := func(record map[string]any, want string) {
		t.Helper()
		if got := record["display_id"]; got != want {
			t.Fatalf("display_id = %v, want %s in %v", got, want, record)
		}
	}
	project := func(name string) string {
		t.Helper()
		return create("/api/v1/projects", map[string]any{"name": name})["id"].(string)
	}
	first, second := project("first"), project("second")
	items := func(projectID string) string { return "/api/v1/projects/" + projectID + "/item-definitions" }
	itemBody := map[string]any{"name": "Item", "scope_type": "ITEM"}
	item := func(projectID, want string) string {
		t.Helper()
		row := create(items(projectID), itemBody)
		wantID(row, want)
		return row["id"].(string)
	}
	item1, item2 := item(first, "IT-1"), item(first, "IT-2")
	other := item(second, "IT-1")
	of := func(itemID, collection string) string { return "/api/v1/item-definitions/" + itemID + "/" + collection }

	for _, element := range []displayIDElement{
		{name: "item", prefix: "IT", collections: [2]string{items(first), items(first)}, other: items(second),
			body: itemBody, patch: map[string]any{"name": "Patched"}, next: 3, otherNext: 2},
		{name: "asset", prefix: "AS", collections: [2]string{of(item1, "assets"), of(item2, "assets")}, other: of(other, "assets"),
			body: map[string]any{"name": "ECU"}, patch: map[string]any{"name": "Patched"}, next: 1, otherNext: 1},
		{name: "damage scenario", prefix: "DS", collections: [2]string{of(item1, "damage-scenarios"), of(item2, "damage-scenarios")},
			other: of(other, "damage-scenarios"), body: map[string]any{"title": "Damage"}, patch: map[string]any{"title": "Patched"},
			next: 1, otherNext: 1},
		{name: "attack path", prefix: "AP", collections: [2]string{of(item1, "attack-paths"), of(item2, "attack-paths")},
			other: of(other, "attack-paths"), body: map[string]any{"title": "Path"}, patch: map[string]any{"title": "Patched"},
			next: 1, otherNext: 1},
	} {
		id := func(n int) string { return fmt.Sprintf("%s-%d", element.prefix, n) }

		// Numbers count per project and type, across the project's items.
		oldest := create(element.collections[0], element.body)
		wantID(oldest, id(element.next))
		newest := create(element.collections[1], element.body)
		wantID(newest, id(element.next+1))
		wantID(create(element.other, element.body), id(element.otherNext))

		// Reads and writes return the number unchanged, and clients cannot set or change it.
		newestPath := element.collections[1] + "/" + newest["id"].(string)
		wantID(propertyResponse(t, api.Get(newestPath), 200), id(element.next+1))
		var listed []map[string]any
		if err := json.Unmarshal(api.Get(element.collections[0]).Body.Bytes(), &listed); err != nil {
			t.Fatalf("list %s: %v", element.name, err)
		}
		found := false
		for _, row := range listed {
			if row["id"] == oldest["id"] {
				wantID(row, id(element.next))
				found = true
			}
		}
		if !found {
			t.Fatalf("list of %s: %v does not contain %v", element.name, listed, oldest["id"])
		}
		wantID(propertyResponse(t, api.Put(newestPath, element.body), 200), id(element.next+1))
		wantID(propertyResponse(t, api.Patch(newestPath, element.patch), 200), id(element.next+1))
		withID := func(body map[string]any) map[string]any {
			body = maps.Clone(body)
			body["display_id"] = id(99)
			return body
		}
		for _, response := range []*httptest.ResponseRecorder{
			api.Post(element.collections[0], withID(element.body)),
			api.Put(newestPath, withID(element.body)),
			api.Patch(newestPath, withID(element.patch)),
		} {
			if response.Code != 422 || !strings.Contains(response.Body.String(), "display_id") {
				t.Fatalf("%s with display_id: %d %s, want 422 for display_id", element.name, response.Code, response.Body)
			}
		}
		wantID(propertyResponse(t, api.Get(newestPath), 200), id(element.next+1))

		// The number of a deleted element, even the highest, is not reused.
		propertyStatus(t, api.Delete(newestPath), 204)
		wantID(create(element.collections[0], element.body), id(element.next+2))

		// A rolled-back creation does not use up a number.
		if _, err := tx.Exec(ctx, "SAVEPOINT rolled_back_create"); err != nil {
			t.Fatal(err)
		}
		wantID(create(element.collections[0], element.body), id(element.next+3))
		if _, err := tx.Exec(ctx, "ROLLBACK TO SAVEPOINT rolled_back_create"); err != nil {
			t.Fatal(err)
		}
		wantID(create(element.collections[0], element.body), id(element.next+3))
	}

	// Threat scenarios have no API yet, but their create query assigns numbers in the same way.
	for _, tc := range []struct {
		itemID string
		want   int32
	}{{item1, 1}, {item2, 2}, {other, 1}} {
		threat, err := db.New(tx).CreateThreatScenario(ctx, db.CreateThreatScenarioParams{ItemDefinitionID: mustUUID(tc.itemID), Title: "Threat"})
		if err != nil || threat.DisplayNumber != tc.want {
			t.Fatalf("threat scenario display number = %d, %v; want %d", threat.DisplayNumber, err, tc.want)
		}
	}

	// The audit history records the display ID in every snapshot of an element.
	snapshots := map[string]int{}
	for _, event := range auditEvents(t, ctx, tx, first) {
		switch event.TargetType {
		case db.TargetItemDefinition, db.TargetAsset, db.TargetDamageScenario, db.TargetAttackPath:
		default:
			continue
		}
		for _, snapshot := range []any{event.Before, event.After} {
			if snapshot == nil {
				continue
			}
			if record, _ := snapshot.(map[string]any); record["display_id"] == nil {
				t.Fatalf("%s event of %s without display_id: %v", event.Event, event.Target, snapshot)
			}
			snapshots[event.TargetType]++
		}
		if event.Event == db.TargetItemDefinition+".created" && event.Target == item1 && event.After.(map[string]any)["display_id"] != "IT-1" {
			t.Fatalf("created event of the first item = %v, want display_id IT-1", event.After)
		}
	}
	if len(snapshots) != 4 {
		t.Fatalf("audit snapshots per element type = %v, want some for each of the four types", snapshots)
	}

	// An element must belong to its item's project.
	if _, err := tx.Exec(ctx, "SAVEPOINT foreign_project"); err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO asset (item_definition_id, tara_project_id, display_number, name) VALUES ($1, $2, 100, 'Moved')`, item1, second)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23503" {
		t.Fatalf("asset in another project than its item: %v, want a foreign key violation", err)
	}
	if _, err := tx.Exec(ctx, "ROLLBACK TO SAVEPOINT foreign_project"); err != nil {
		t.Fatal(err)
	}
}

// committedDB connects to the test database for tests that need committed rows, because they use
// several connections. It returns the pool, a store on it, as the server uses it, and the subject and ID
// of a new user, which is deleted after the test.
func committedDB(t *testing.T) (context.Context, *pgxpool.Pool, *db.Store, string, pgtype.UUID) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close) // registered first, so it runs after the cleanups that use the pool
	store := db.NewStore(pool)
	subject := "display-id-test-" + rand.Text()
	owner, err := store.UpsertIAMUser(ctx, subject)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanup(t, ctx, pool, "DELETE FROM iam_user WHERE external_iam_sub = $1", subject) })
	return ctx, pool, store, subject, mustUUID(owner)
}

// committedProject creates a project of owner and deletes it with its content and history after the test.
func committedProject(t *testing.T, ctx context.Context, pool *pgxpool.Pool, store *db.Store, owner pgtype.UUID) pgtype.UUID {
	t.Helper()
	project, err := store.CreateTaraProject(ctx, db.CreateTaraProjectParams{Name: "Display ID test", OwnerID: owner})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupProject(t, ctx, pool, project.ID) })
	return project.ID
}

func cleanupProject(t *testing.T, ctx context.Context, pool *pgxpool.Pool, projectID any) {
	t.Helper()
	cleanup(t, ctx, pool, "DELETE FROM item_definition WHERE tara_project_id = $1", projectID)
	cleanup(t, ctx, pool, "DELETE FROM tara_project WHERE id = $1", projectID)
	cleanup(t, ctx, pool, "DELETE FROM audit_event WHERE tara_project_id = $1", projectID)
}

func cleanup(t *testing.T, ctx context.Context, pool *pgxpool.Pool, sql string, arg any) {
	t.Helper()
	if _, err := pool.Exec(ctx, sql, arg); err != nil {
		t.Log(err)
	}
}

// TestDisplayIDsServerStorePostgres creates each element type through the API on a store that uses the
// pool directly, as the server does. Unlike a store on a test transaction, that store rejects locking
// reads outside an audited transaction, so this catches a create query that the server cannot run.
func TestDisplayIDsServerStorePostgres(t *testing.T) {
	ctx, pool, store, subject, _ := committedDB(t)
	fixture := authtest.NewFixture(t, store)
	api := &routeAPI{t: t, handler: httpapi.New(store, fixture.Manager), token: "Bearer " + fixture.Token(t, map[string]any{"sub": subject})}
	create := func(path string, body map[string]any, wantID string) string {
		t.Helper()
		row := propertyResponse(t, api.Post(path, body), 201)
		if row["display_id"] != wantID {
			t.Fatalf("display_id = %v, want %s in %v", row["display_id"], wantID, row)
		}
		return row["id"].(string)
	}
	project := propertyResponse(t, api.Post("/api/v1/projects", map[string]any{"name": "Display ID server store test"}), 201)["id"].(string)
	t.Cleanup(func() { cleanupProject(t, ctx, pool, project) })
	item := create("/api/v1/projects/"+project+"/item-definitions", map[string]any{"name": "Item", "scope_type": "ITEM"}, "IT-1")
	of := "/api/v1/item-definitions/" + item + "/"
	create(of+"assets", map[string]any{"name": "ECU"}, "AS-1")
	create(of+"damage-scenarios", map[string]any{"title": "Damage"}, "DS-1")
	create(of+"attack-paths", map[string]any{"title": "Path"}, "AP-1")
}

// TestDisplayIDsConcurrentPostgres creates items, then assets of one new project in parallel
// transactions, each creating one element, and checks that each type gets the consecutive numbers 1..n.
// Both rounds start without a counter row, so they also cover its concurrent first insert.
func TestDisplayIDsConcurrentPostgres(t *testing.T) {
	ctx, pool, store, _, owner := committedDB(t)
	project := committedProject(t, ctx, pool, store, owner)

	const n = 20
	// inParallel runs create(i) for i in 0..n-1, each in its own transaction, started at the same time.
	inParallel := func(create func(q *db.Queries, i int) (pgtype.UUID, error)) []string {
		t.Helper()
		var wg sync.WaitGroup
		start := make(chan struct{})
		ids := make([]string, n)
		errs := make([]error, n)
		for i := range n {
			wg.Go(func() {
				<-start
				errs[i] = pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
					id, err := create(db.New(tx), i)
					ids[i] = id.String()
					return err
				})
			})
		}
		close(start)
		wg.Wait()
		if err := errors.Join(errs...); err != nil {
			t.Fatal(err)
		}
		return ids
	}
	wantNumbers := func(table string) {
		t.Helper()
		rows, err := pool.Query(ctx, "SELECT display_number FROM "+table+" WHERE tara_project_id = $1 ORDER BY display_number", project)
		if err != nil {
			t.Fatal(err)
		}
		got, err := pgx.CollectRows(rows, pgx.RowTo[int32])
		if err != nil {
			t.Fatal(err)
		}
		want := make([]int32, n)
		for i := range want {
			want[i] = int32(i + 1)
		}
		if !slices.Equal(got, want) {
			t.Fatalf("%s display numbers = %v, want %v", table, got, want)
		}
	}

	items := inParallel(func(q *db.Queries, i int) (pgtype.UUID, error) {
		row, err := q.CreateItemDefinition(ctx, db.CreateItemDefinitionParams{
			ProjectID: project, Name: fmt.Sprintf("Item %d", i), ScopeType: db.ScopeTypeITEM,
		})
		return row.ID, err
	})
	wantNumbers("item_definition")
	inParallel(func(q *db.Queries, i int) (pgtype.UUID, error) {
		row, err := q.CreateAsset(ctx, db.CreateAssetParams{ItemDefinitionID: mustUUID(items[i]), Name: fmt.Sprintf("Asset %d", i)})
		return row.ID, err
	})
	wantNumbers("asset")
}

// TestDisplayIDsProjectDeletePostgres runs a creation while the purge of a deleted project holds the
// project lock. The purge then removes the project with its content and counters (ON DELETE CASCADE).
// An item creation locks the project before its counter, so it waits for the purge instead of
// deadlocking with it. An element creation takes no project lock. If the counter row exists, the
// creation does not wait, and the purge deletes the new element with its item; the first one of its
// type waits through the new counter row's foreign key, but cannot deadlock, because the purge does
// not see that row.
func TestDisplayIDsProjectDeletePostgres(t *testing.T) {
	ctx, pool, store, _, owner := committedDB(t)
	createAsset := func(q *db.Queries, itemID string) error {
		_, err := q.CreateAsset(ctx, db.CreateAssetParams{ItemDefinitionID: mustUUID(itemID), Name: "New"})
		return err
	}
	for _, tc := range []struct {
		name string
		// seed prepares the project and returns the argument of create, which runs in its own transaction.
		seed   func(projectID string) string
		create func(q *db.Queries, arg string) error
		waits  bool // whether the creation waits for the deletion
		// Error of the creation expected to contain this text; empty for none. The deletion always succeeds.
		wantCreateErr string
	}{
		{
			name: "item in a project without items",
			seed: func(projectID string) string {
				itemID := seedItem(t, ctx, pool, projectID, "Deleted") // leaves the item counter behind
				if _, err := pool.Exec(ctx, "DELETE FROM item_definition WHERE id = $1", itemID); err != nil {
					t.Fatal(err)
				}
				return projectID
			},
			create: func(q *db.Queries, projectID string) error {
				_, err := q.CreateItemDefinition(ctx, db.CreateItemDefinitionParams{ProjectID: mustUUID(projectID), Name: "New", ScopeType: db.ScopeTypeITEM})
				return err
			},
			waits:         true,
			wantCreateErr: pgx.ErrNoRows.Error(),
		},
		{
			name: "asset with an existing asset counter",
			seed: func(projectID string) string {
				itemID := seedItem(t, ctx, pool, projectID, "Item")
				seedAsset(t, ctx, pool, itemID, "Existing") // creates the asset counter row
				return itemID
			},
			create: createAsset,
		},
		{
			name: "first asset of the project",
			seed: func(projectID string) string {
				return seedItem(t, ctx, pool, projectID, "Item")
			},
			create:        createAsset,
			waits:         true, // for the foreign key of the new counter row
			wantCreateErr: "23503",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			project := committedProject(t, ctx, pool, store, owner)
			arg := tc.seed(project.String())

			deletion, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			conn, err := pool.Acquire(ctx)
			if err != nil {
				_ = deletion.Rollback(ctx)
				t.Fatal(err)
			}
			created := make(chan error, 1)
			createDone := false
			defer func() { // in this order also when the test fails while the creation waits
				_ = deletion.Rollback(ctx)
				if !createDone {
					<-created
				}
				conn.Release()
			}()
			if _, err := deletion.Exec(ctx, "SELECT id FROM tara_project WHERE id = $1 FOR UPDATE", project); err != nil {
				t.Fatal(err)
			}
			go func() {
				created <- pgx.BeginFunc(ctx, conn, func(tx pgx.Tx) error { return tc.create(db.New(tx), arg) })
			}()
			var createErr error
			// finish waits for the creation, but fails the test instead of hanging if it is blocked.
			finish := func() {
				t.Helper()
				select {
				case createErr = <-created:
					createDone = true
				case <-time.After(5 * time.Second):
					t.Fatal("the creation did not finish") // the deferred rollback of the deletion releases it
				}
			}
			if tc.waits {
				waitForLock(t, ctx, pool, conn.Conn().PgConn().PID())
			} else {
				finish()
			}

			_, deleteErr := deletion.Exec(ctx, "DELETE FROM tara_project WHERE id = $1", project)
			if deleteErr == nil {
				deleteErr = deletion.Commit(ctx)
			} else {
				_ = deletion.Rollback(ctx)
			}
			if !createDone {
				finish()
			}
			for _, check := range []struct {
				what      string
				err       error
				wantInErr string
			}{{"deletion", deleteErr, ""}, {"creation", createErr, tc.wantCreateErr}} {
				if check.wantInErr == "" && check.err != nil || check.wantInErr != "" && (check.err == nil || !strings.Contains(check.err.Error(), check.wantInErr)) {
					t.Errorf("%s: %v, want %q (empty: no error)", check.what, check.err, check.wantInErr)
				}
			}
		})
	}
}

// waitForLock waits until the backend with the process ID pid waits for a lock.
func waitForLock(t *testing.T, ctx context.Context, pool *pgxpool.Pool, pid uint32) {
	t.Helper()
	for range 500 {
		var waiting bool
		if err := pool.QueryRow(ctx, "SELECT coalesce(wait_event_type = 'Lock', false) FROM pg_stat_activity WHERE pid = $1", int64(pid)).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("the creation did not wait for the project lock")
}
