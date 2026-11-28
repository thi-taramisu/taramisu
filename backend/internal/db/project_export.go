package db

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// ProjectExport holds every record of one project, one list per table.
type ProjectExport struct {
	Project                  TaraProject
	ItemDefinitions          []ItemDefinition
	Assets                   []Asset
	AssetProperties          []AssetCybersecurityProperty
	DamageScenarios          []DamageScenario
	DamageScenarioProperties []DamageScenarioAssetProperty
	ImpactRatings            []ImpactRating
	ThreatScenarios          []ThreatScenario
	ThreatScenarioProperties []ThreatScenarioAssetProperty
	ThreatDamageLinks        []ThreatDamageLink
	AttackPaths              []AttackPath
	ThreatAttackPathLinks    []ThreatAttackPathLink
	AttackFeasibilityRatings []AttackFeasibilityRating
	RiskValues               []RiskValue
	RiskTreatmentDecisions   []RiskTreatmentDecision
}

func (q *Queries) ExportProject(ctx context.Context, id pgtype.UUID) (out ProjectExport, err error) {
	if out.Project, err = q.GetTaraProject(ctx, id); err != nil {
		return out, err
	}
	if out.ItemDefinitions, err = q.ExportItemDefinitions(ctx, id); err != nil {
		return out, err
	}
	if out.Assets, err = q.ExportAssets(ctx, id); err != nil {
		return out, err
	}
	if out.AssetProperties, err = q.ExportAssetCybersecurityProperties(ctx, id); err != nil {
		return out, err
	}
	if out.DamageScenarios, err = q.ExportDamageScenarios(ctx, id); err != nil {
		return out, err
	}
	if out.DamageScenarioProperties, err = q.ExportDamageScenarioAssetProperties(ctx, id); err != nil {
		return out, err
	}
	if out.ImpactRatings, err = q.ExportImpactRatings(ctx, id); err != nil {
		return out, err
	}
	if out.ThreatScenarios, err = q.ExportThreatScenarios(ctx, id); err != nil {
		return out, err
	}
	if out.ThreatScenarioProperties, err = q.ExportThreatScenarioAssetProperties(ctx, id); err != nil {
		return out, err
	}
	if out.ThreatDamageLinks, err = q.ExportThreatDamageLinks(ctx, id); err != nil {
		return out, err
	}
	if out.AttackPaths, err = q.ExportAttackPaths(ctx, id); err != nil {
		return out, err
	}
	if out.ThreatAttackPathLinks, err = q.ExportThreatAttackPathLinks(ctx, id); err != nil {
		return out, err
	}
	if out.AttackFeasibilityRatings, err = q.ExportAttackFeasibilityRatings(ctx, id); err != nil {
		return out, err
	}
	if out.RiskValues, err = q.ExportRiskValues(ctx, id); err != nil {
		return out, err
	}
	out.RiskTreatmentDecisions, err = q.ExportRiskTreatmentDecisions(ctx, id)
	return out, err
}

// ExportProject reads everything in one read-only snapshot, so edits during the export cannot make it inconsistent.
func (s *Store) ExportProject(ctx context.Context, id pgtype.UUID) (ProjectExport, error) {
	tx, err := s.conn.Begin(ctx)
	if err != nil {
		return ProjectExport{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// A Store built on a pgx.Tx (as in tests) is already inside a transaction, where the level can no longer be set.
	if _, inTx := s.conn.(pgx.Tx); !inTx {
		if _, err := tx.Exec(ctx, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"); err != nil {
			return ProjectExport{}, err
		}
	}
	return s.WithTx(tx).ExportProject(ctx, id)
}
