package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// ExportFormatVersion is the version of the export document; increase it when the structure changes.
const ExportFormatVersion = 1

type ProjectExportStore interface {
	ExportProject(context.Context, pgtype.UUID) (db.ProjectExport, error)
}

type ProjectExport struct {
	store  ProjectExportStore
	access ProjectAccessStore
}

func NewProjectExport(store ProjectExportStore, access ProjectAccessStore) *ProjectExport {
	return &ProjectExport{store: store, access: access}
}

func (h *ProjectExport) Register(api huma.API) {
	api.OpenAPI().Tags = append(api.OpenAPI().Tags, &huma.Tag{
		Name: "Project Export", Description: "Export a whole TARA project as one JSON document.",
	})
	op := huma.Operation{
		OperationID: "export-tara-project", Method: http.MethodGet, Path: "/api/v1/projects/{id}/export",
		Summary: "Export a TARA project",
		Description: "Returns the project with all item definitions and everything below them as one JSON document. " +
			"Members and uploaded files are not included.",
		Tags: []string{"Project Export"}, Security: []map[string][]string{{"bearer": {}}},
	}
	Register(api, op, InProject(h.access, ScopeProject("id"), PermRead), h.Export)
}

type ProjectExportBody struct {
	FormatVersion int                 `json:"format_version" example:"1"`
	ExportedAt    time.Time           `json:"exported_at"`
	Project       ProjectExportInfo   `json:"project"`
	Items         []ProjectExportItem `json:"items"`
}

type ProjectExportInfo struct {
	ID          string    `json:"id" format:"uuid"`
	Name        string    `json:"name"`
	Description *string   `json:"description" nullable:"true"`
	CreatedAt   time.Time `json:"created_at"`
}

// ProjectExportItem is an item definition with everything below it; references between records use their IDs.
type ProjectExportItem struct {
	ItemDefinition
	Assets          []ProjectExportAsset          `json:"assets"`
	DamageScenarios []ProjectExportDamageScenario `json:"damage_scenarios"`
	ThreatScenarios []ProjectExportThreatScenario `json:"threat_scenarios"`
	AttackPaths     []ProjectExportAttackPath     `json:"attack_paths"`
}

type ProjectExportAsset struct {
	Asset
	CybersecurityProperties []AssetCybersecurityProperty `json:"cybersecurity_properties"`
}

type ProjectExportDamageScenario struct {
	DamageScenarioBody
	ImpactRatings      []ImpactRatingBody   `json:"impact_ratings"`
	AssetPropertyLinks []DamagePropertyLink `json:"asset_property_links"`
}

type ThreatScenarioExportBody struct {
	ID                          string                `json:"id" format:"uuid"`
	ItemDefinitionID            string                `json:"item_definition_id" format:"uuid"`
	Title                       string                `json:"title"`
	CauseOfCompromise           *string               `json:"cause_of_compromise" nullable:"true"`
	ElicitationMethod           *db.ElicitationMethod `json:"elicitation_method" nullable:"true" enum:"GROUP_DISCUSSION,MALICIOUS_USE_CASE,EVITA,TVRA,PASTA,STRIDE,OTHER"`
	TechnicalNotes              *string               `json:"technical_notes" nullable:"true"`
	AggregatedAttackFeasibility *db.AttackFeasibility `json:"aggregated_attack_feasibility" nullable:"true" enum:"HIGH,MEDIUM,LOW,VERY_LOW"`
	MaxRiskScore                *int32                `json:"max_risk_score" nullable:"true"`
}

type ProjectExportThreatScenario struct {
	ThreatScenarioExportBody
	AssetPropertyLinks     []ThreatPropertyLink       `json:"asset_property_links"`
	DamageScenarioLinks    []ThreatDamageLinkBody     `json:"damage_scenario_links"`
	AttackPathLinks        []ThreatAttackPathLinkBody `json:"attack_path_links"`
	RiskValues             []RiskValue                `json:"risk_values"`
	RiskTreatmentDecisions []RiskTreatmentDecision    `json:"risk_treatment_decisions"`
}

type ProjectExportAttackPath struct {
	AttackPathBody
	FeasibilityRating *AttackFeasibilityRatingBody `json:"feasibility_rating,omitempty"`
}

type ProjectExportOutput struct {
	ContentDisposition string `header:"Content-Disposition"`
	Body               ProjectExportBody
}

func (h *ProjectExport) Export(ctx context.Context, _ *TaraProjectIDInput) (*ProjectExportOutput, error) {
	data, err := h.store.ExportProject(ctx, projectIDFromContext(ctx))
	if err != nil {
		return nil, mapTaraProjectError(err)
	}
	audit(ctx, "project.exported", "project", data.Project.ID.String())
	return &ProjectExportOutput{
		ContentDisposition: `attachment; filename="project-` + data.Project.ID.String() + `.json"`,
		Body:               buildProjectExport(data, time.Now().UTC()),
	}, nil
}

// buildProjectExport nests the per-table lists below their item. Lists are never nil, so they export as [] and not null.
func buildProjectExport(data db.ProjectExport, now time.Time) ProjectExportBody {
	items := make([]ProjectExportItem, 0, len(data.ItemDefinitions))
	itemAt := map[string]int{}
	for _, row := range data.ItemDefinitions {
		itemAt[row.ID.String()] = len(items)
		items = append(items, ProjectExportItem{
			ItemDefinition:  itemDefinition(row),
			Assets:          []ProjectExportAsset{},
			DamageScenarios: []ProjectExportDamageScenario{},
			ThreatScenarios: []ProjectExportThreatScenario{},
			AttackPaths:     []ProjectExportAttackPath{},
		})
	}

	propertiesByAsset := map[string][]AssetCybersecurityProperty{}
	for _, row := range data.AssetProperties {
		propertiesByAsset[row.AssetID.String()] = append(propertiesByAsset[row.AssetID.String()], assetCybersecurityPropertyBody(row))
	}
	for _, row := range data.Assets {
		i := itemAt[row.ItemDefinitionID.String()]
		properties := propertiesByAsset[row.ID.String()]
		if properties == nil {
			properties = []AssetCybersecurityProperty{}
		}
		items[i].Assets = append(items[i].Assets, ProjectExportAsset{Asset: assetBody(row), CybersecurityProperties: properties})
	}

	ratingsByDamage := map[string][]ImpactRatingBody{}
	for _, row := range data.ImpactRatings {
		ratingsByDamage[row.DamageScenarioID.String()] = append(ratingsByDamage[row.DamageScenarioID.String()], toImpactRatingBody(row))
	}
	linksByDamage := map[string][]DamagePropertyLink{}
	for _, row := range data.DamageScenarioProperties {
		linksByDamage[row.DamageScenarioID.String()] = append(linksByDamage[row.DamageScenarioID.String()], damagePropertyLinkBody(row))
	}
	for _, row := range data.DamageScenarios {
		i := itemAt[row.ItemDefinitionID.String()]
		out := ProjectExportDamageScenario{
			DamageScenarioBody: toDamageScenarioBody(row),
			ImpactRatings:      ratingsByDamage[row.ID.String()],
			AssetPropertyLinks: linksByDamage[row.ID.String()],
		}
		if out.ImpactRatings == nil {
			out.ImpactRatings = []ImpactRatingBody{}
		}
		if out.AssetPropertyLinks == nil {
			out.AssetPropertyLinks = []DamagePropertyLink{}
		}
		items[i].DamageScenarios = append(items[i].DamageScenarios, out)
	}

	threats := make([]ProjectExportThreatScenario, len(data.ThreatScenarios))
	threatAt := map[string]int{}
	for i, row := range data.ThreatScenarios {
		threatAt[row.ID.String()] = i
		threats[i] = ProjectExportThreatScenario{
			ThreatScenarioExportBody: ThreatScenarioExportBody{
				ID: row.ID.String(), ItemDefinitionID: row.ItemDefinitionID.String(), Title: row.Title,
				CauseOfCompromise: row.CauseOfCompromise, ElicitationMethod: row.ElicitationMethod,
				TechnicalNotes: row.TechnicalNotes, AggregatedAttackFeasibility: row.AggregatedAttackFeasibility,
				MaxRiskScore: row.MaxRiskScore,
			},
			AssetPropertyLinks:     []ThreatPropertyLink{},
			DamageScenarioLinks:    []ThreatDamageLinkBody{},
			AttackPathLinks:        []ThreatAttackPathLinkBody{},
			RiskValues:             []RiskValue{},
			RiskTreatmentDecisions: []RiskTreatmentDecision{},
		}
	}
	for _, row := range data.ThreatScenarioProperties {
		t := &threats[threatAt[row.ThreatScenarioID.String()]]
		t.AssetPropertyLinks = append(t.AssetPropertyLinks, threatPropertyLinkBody(row))
	}
	for _, row := range data.ThreatDamageLinks {
		t := &threats[threatAt[row.ThreatScenarioID.String()]]
		t.DamageScenarioLinks = append(t.DamageScenarioLinks, toThreatDamageLinkBody(row))
	}
	for _, row := range data.ThreatAttackPathLinks {
		t := &threats[threatAt[row.ThreatScenarioID.String()]]
		t.AttackPathLinks = append(t.AttackPathLinks, toThreatAttackPathLinkBody(row))
	}
	for _, row := range data.RiskValues {
		t := &threats[threatAt[row.ThreatScenarioID.String()]]
		t.RiskValues = append(t.RiskValues, toRiskValue(row))
	}
	for _, row := range data.RiskTreatmentDecisions {
		t := &threats[threatAt[row.ThreatScenarioID.String()]]
		t.RiskTreatmentDecisions = append(t.RiskTreatmentDecisions, toRiskTreatmentDecision(row))
	}
	for i, row := range data.ThreatScenarios {
		item := &items[itemAt[row.ItemDefinitionID.String()]]
		item.ThreatScenarios = append(item.ThreatScenarios, threats[i])
	}

	ratingByPath := map[string]*AttackFeasibilityRatingBody{}
	for _, row := range data.AttackFeasibilityRatings {
		body := toRatingBody(row)
		ratingByPath[row.AttackPathID.String()] = &body
	}
	for _, row := range data.AttackPaths {
		i := itemAt[row.ItemDefinitionID.String()]
		items[i].AttackPaths = append(items[i].AttackPaths, ProjectExportAttackPath{
			AttackPathBody: toAttackPathBody(row), FeasibilityRating: ratingByPath[row.ID.String()],
		})
	}

	return ProjectExportBody{
		FormatVersion: ExportFormatVersion,
		ExportedAt:    now,
		Project: ProjectExportInfo{
			ID: data.Project.ID.String(), Name: data.Project.Name, Description: data.Project.Description,
			CreatedAt: data.Project.CreatedAt.Time,
		},
		Items: items,
	}
}
