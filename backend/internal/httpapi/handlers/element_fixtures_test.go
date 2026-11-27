package handlers_test

import (
	"context"
	"testing"

	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// Fixtures for integration tests. They use the create queries, so the records get their display
// numbers as through the API.

func seedItem(t *testing.T, ctx context.Context, q db.DBTX, projectID, name string) string {
	t.Helper()
	row, err := db.New(q).CreateItemDefinition(ctx, db.CreateItemDefinitionParams{
		ProjectID: mustUUID(projectID), Name: name, ScopeType: db.ScopeTypeITEM,
	})
	if err != nil {
		t.Fatal(err)
	}
	return row.ID.String()
}

func seedAsset(t *testing.T, ctx context.Context, q db.DBTX, itemID, name string) string {
	t.Helper()
	row, err := db.New(q).CreateAsset(ctx, db.CreateAssetParams{ItemDefinitionID: mustUUID(itemID), Name: name})
	if err != nil {
		t.Fatal(err)
	}
	return row.ID.String()
}

func seedDamageScenario(t *testing.T, ctx context.Context, q db.DBTX, itemID, title string) string {
	t.Helper()
	row, err := db.New(q).CreateDamageScenario(ctx, db.CreateDamageScenarioParams{
		ItemDefinitionID: mustUUID(itemID), Title: title,
	})
	if err != nil {
		t.Fatal(err)
	}
	return row.ID.String()
}

func seedThreatScenario(t *testing.T, ctx context.Context, q db.DBTX, itemID, title string) string {
	t.Helper()
	row, err := db.New(q).CreateThreatScenario(ctx, db.CreateThreatScenarioParams{
		ItemDefinitionID: mustUUID(itemID), Title: title,
	})
	if err != nil {
		t.Fatal(err)
	}
	return row.ID.String()
}

func seedAttackPath(t *testing.T, ctx context.Context, q db.DBTX, itemID, title string) string {
	t.Helper()
	row, err := db.New(q).CreateAttackPath(ctx, db.CreateAttackPathParams{
		ItemDefinitionID: mustUUID(itemID), Title: title, IsPartialEarlyStage: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	return row.ID.String()
}
