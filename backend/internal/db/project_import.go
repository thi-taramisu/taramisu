package db

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// ProjectImport is a whole project to create from a document. A Key is the ID the document gives a
// record, so that other records can refer to it; it is empty for a record nobody refers to. Keys
// and references are resolved within one item. The records get new IDs.
type ProjectImport struct {
	Name          string
	Description   *string
	FormatVersion int
	Items         []ImportItem
}

type ImportItem struct {
	Params          CreateItemDefinitionParams // ProjectID is set by ImportProject
	Assets          []ImportAsset
	DamageScenarios []ImportDamageScenario
	AttackPaths     []ImportAttackPath
	ThreatScenarios []ImportThreatScenario
}

type ImportAsset struct {
	Params     CreateAssetParams
	Properties []ImportProperty
}

type ImportProperty struct {
	Key    string
	Params CreateAssetCybersecurityPropertyParams
}

type ImportDamageScenario struct {
	Key           string
	Params        CreateDamageScenarioParams
	ImpactRatings []ImportImpactRating
	PropertyLinks []ImportDamagePropertyLink
}

type ImportImpactRating struct {
	Key    string
	Params CreateImpactRatingParams
}

type ImportDamagePropertyLink struct {
	PropertyKey string
	Note        *string
}

type ImportAttackPath struct {
	Key    string
	Params CreateAttackPathParams
	Rating *UpsertAttackFeasibilityRatingParams // nil if the path has no rating
}

type ImportThreatScenario struct {
	Params             ImportThreatScenarioParams
	PropertyKeys       []string
	DamageScenarioKeys []string
	AttackPathKeys     []string
	RiskValues         []ImportRiskValue
	Decisions          []ImportTreatmentDecision
}

type ImportRiskValue struct {
	Key             string
	ImpactRatingKey string
	RiskScore       int32
	Method          RiskDeterminationMethod
}

type ImportTreatmentDecision struct {
	RiskValueKey         string // empty if the decision does not refer to a risk value
	TreatmentOption      RiskTreatmentOption
	DecisionRationale    *string
	IsCybersecurityClaim bool
}

// ImportedProjectState is what project.imported records: the new project and the format of the document.
type ImportedProjectState struct {
	Name          string      `json:"name"`
	FormatVersion int         `json:"format_version"`
	FirstOwner    pgtype.UUID `json:"first_owner,omitzero"`
}

// ImportError says which part of the document is wrong. The API answers it with 422.
type ImportError struct {
	Path    string // JSON path in the document, for example items[0].assets[1]
	Message string
}

func (e *ImportError) Error() string { return e.Path + ": " + e.Message }

// ImportProject creates the project, makes the caller its first Owner, and creates everything in
// the document in one transaction: it is imported completely, or not at all. It returns an
// *ImportError for a document that breaks a reference or a rule of the database.
func (s *Store) ImportProject(ctx context.Context, actor Actor, in ProjectImport) (project CreateTaraProjectRow, err error) {
	err = s.Audit(ctx, actor, func(ctx context.Context) (Change, error) {
		var err error
		project, err = s.CreateTaraProject(ctx, CreateTaraProjectParams{Name: in.Name, Description: in.Description, OwnerID: actor.UserID})
		if err != nil {
			return Change{}, err
		}
		for i, item := range in.Items {
			if err := s.importItem(ctx, project.ID, fmt.Sprintf("items[%d]", i), item); err != nil {
				return Change{}, err
			}
		}
		return Change{
			Event: EventProjectImported, ProjectID: project.ID, TargetType: TargetProject, TargetID: project.ID,
			After: ImportedProjectState{Name: in.Name, FormatVersion: in.FormatVersion, FirstOwner: actor.UserID},
		}, nil
	})
	return project, err
}

// keys maps the keys of one kind of record in one item to the IDs they got.
type keys map[string]pgtype.UUID

func (k keys) add(path, key string, id pgtype.UUID) error {
	if key == "" {
		return nil
	}
	if _, used := k[key]; used {
		return &ImportError{path + ".id", fmt.Sprintf("%q is used by another record of this kind in the same item", key)}
	}
	k[key] = id
	return nil
}

func (k keys) resolve(path, key, what string) (pgtype.UUID, error) {
	id, ok := k[key]
	if !ok {
		return id, &ImportError{path, fmt.Sprintf("no %s with the id %q in the same item", what, key)}
	}
	return id, nil
}

// importStep adds the place in the document to a database error. A violated constraint is a problem
// of the document, not of the server.
func importStep(path string, err error) error {
	var pgErr *pgconn.PgError
	switch {
	case err == nil:
		return nil
	case errors.As(err, &pgErr) && len(pgErr.Code) == 5 && pgErr.Code[:2] == "23": // integrity constraint violation
		return &ImportError{path, "breaks the rule " + pgErr.ConstraintName + ": " + pgErr.Message}
	case errors.Is(err, pgx.ErrNoRows):
		return &ImportError{path, "refers to a record that does not belong to the same item"}
	default:
		return fmt.Errorf("%s: %w", path, err)
	}
}

func (s *Store) importItem(ctx context.Context, projectID pgtype.UUID, path string, in ImportItem) error {
	q := s.Queries
	in.Params.ProjectID = projectID
	item, err := q.CreateItemDefinition(ctx, in.Params)
	if err := importStep(path, err); err != nil {
		return err
	}
	itemID := item.ID

	properties, damages, attackPaths, ratings := keys{}, keys{}, keys{}, keys{}
	for i, asset := range in.Assets {
		path := fmt.Sprintf("%s.assets[%d]", path, i)
		asset.Params.ItemDefinitionID = itemID
		created, err := q.CreateAsset(ctx, asset.Params)
		if err := importStep(path, err); err != nil {
			return err
		}
		for j, property := range asset.Properties {
			path := fmt.Sprintf("%s.cybersecurity_properties[%d]", path, j)
			property.Params.AssetID, property.Params.ItemDefinitionID = created.ID, itemID
			createdProperty, err := q.CreateAssetCybersecurityProperty(ctx, property.Params)
			if err := importStep(path, err); err != nil {
				return err
			}
			if err := properties.add(path, property.Key, createdProperty.ID); err != nil {
				return err
			}
		}
	}

	for i, damage := range in.DamageScenarios {
		path := fmt.Sprintf("%s.damage_scenarios[%d]", path, i)
		damage.Params.ItemDefinitionID = itemID
		created, err := q.CreateDamageScenario(ctx, damage.Params)
		if err := importStep(path, err); err != nil {
			return err
		}
		if err := damages.add(path, damage.Key, created.ID); err != nil {
			return err
		}
		for j, rating := range damage.ImpactRatings {
			path := fmt.Sprintf("%s.impact_ratings[%d]", path, j)
			rating.Params.DamageScenarioID, rating.Params.ItemDefinitionID = created.ID, itemID
			createdRating, err := q.CreateImpactRating(ctx, rating.Params)
			if err := importStep(path, err); err != nil {
				return err
			}
			if err := ratings.add(path, rating.Key, createdRating.ID); err != nil {
				return err
			}
		}
		for j, link := range damage.PropertyLinks {
			path := fmt.Sprintf("%s.asset_property_links[%d]", path, j)
			propertyID, err := properties.resolve(path+".asset_cybersecurity_property_id", link.PropertyKey, "cybersecurity property")
			if err != nil {
				return err
			}
			_, err = q.CreateDamageScenarioAssetProperty(ctx, CreateDamageScenarioAssetPropertyParams{
				DamageScenarioID: created.ID, AssetCybersecurityPropertyID: propertyID, ItemDefinitionID: itemID, CompromiseMechanismNote: link.Note,
			})
			if err := importStep(path, err); err != nil {
				return err
			}
		}
	}

	for i, attackPath := range in.AttackPaths {
		path := fmt.Sprintf("%s.attack_paths[%d]", path, i)
		attackPath.Params.ItemDefinitionID = itemID
		created, err := q.CreateAttackPath(ctx, attackPath.Params)
		if err := importStep(path, err); err != nil {
			return err
		}
		if err := attackPaths.add(path, attackPath.Key, created.ID); err != nil {
			return err
		}
		if attackPath.Rating != nil {
			attackPath.Rating.AttackPathID = created.ID
			_, err := q.UpsertAttackFeasibilityRating(ctx, *attackPath.Rating)
			if err := importStep(path+".feasibility_rating", err); err != nil {
				return err
			}
		}
	}

	for i, threat := range in.ThreatScenarios {
		path := fmt.Sprintf("%s.threat_scenarios[%d]", path, i)
		threat.Params.ItemDefinitionID = itemID
		threatID, err := q.ImportThreatScenario(ctx, threat.Params)
		if err := importStep(path, err); err != nil {
			return err
		}
		for j, key := range threat.PropertyKeys {
			path := fmt.Sprintf("%s.asset_property_links[%d]", path, j)
			propertyID, err := properties.resolve(path+".asset_cybersecurity_property_id", key, "cybersecurity property")
			if err != nil {
				return err
			}
			_, err = q.CreateThreatScenarioAssetProperty(ctx, CreateThreatScenarioAssetPropertyParams{
				ThreatScenarioID: threatID, AssetCybersecurityPropertyID: propertyID, ItemDefinitionID: itemID,
			})
			if err := importStep(path, err); err != nil {
				return err
			}
		}
		for j, key := range threat.DamageScenarioKeys {
			path := fmt.Sprintf("%s.damage_scenario_links[%d]", path, j)
			damageID, err := damages.resolve(path+".damage_scenario_id", key, "damage scenario")
			if err != nil {
				return err
			}
			_, err = q.CreateThreatDamageLink(ctx, CreateThreatDamageLinkParams{ThreatScenarioID: threatID, DamageScenarioID: damageID, ItemDefinitionID: itemID})
			if err := importStep(path, err); err != nil {
				return err
			}
		}
		for j, key := range threat.AttackPathKeys {
			path := fmt.Sprintf("%s.attack_path_links[%d]", path, j)
			attackPathID, err := attackPaths.resolve(path+".attack_path_id", key, "attack path")
			if err != nil {
				return err
			}
			_, err = q.CreateThreatAttackPathLink(ctx, CreateThreatAttackPathLinkParams{ThreatScenarioID: threatID, AttackPathID: attackPathID, ItemDefinitionID: itemID})
			if err := importStep(path, err); err != nil {
				return err
			}
		}
		// A treatment decision can only refer to a risk value of its own threat scenario.
		riskValues := keys{}
		for j, risk := range threat.RiskValues {
			path := fmt.Sprintf("%s.risk_values[%d]", path, j)
			ratingID, err := ratings.resolve(path+".impact_rating_id", risk.ImpactRatingKey, "impact rating")
			if err != nil {
				return err
			}
			created, err := q.CreateRiskValue(ctx, CreateRiskValueParams{
				ThreatScenarioID: threatID, ImpactRatingID: ratingID, RiskScore: risk.RiskScore, DeterminationMethod: risk.Method,
			})
			if err := importStep(path, err); err != nil {
				return err
			}
			if err := riskValues.add(path, risk.Key, created.ID); err != nil {
				return err
			}
		}
		for j, decision := range threat.Decisions {
			path := fmt.Sprintf("%s.risk_treatment_decisions[%d]", path, j)
			var riskValueID pgtype.UUID
			if decision.RiskValueKey != "" {
				if riskValueID, err = riskValues.resolve(path+".risk_value_id", decision.RiskValueKey, "risk value of this threat scenario"); err != nil {
					return err
				}
			}
			_, err := q.CreateRiskTreatmentDecision(ctx, CreateRiskTreatmentDecisionParams{
				ThreatScenarioID: threatID, RiskValueID: riskValueID, TreatmentOption: decision.TreatmentOption,
				DecisionRationale: decision.DecisionRationale, IsCybersecurityClaim: decision.IsCybersecurityClaim,
			})
			if err := importStep(path, err); err != nil {
				return err
			}
		}
	}
	return nil
}
