package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type ProjectImportStore interface {
	ImportProject(context.Context, db.Actor, db.ProjectImport) (db.CreateTaraProjectRow, error)
}

type ProjectImport struct {
	store ProjectImportStore
}

func NewProjectImport(store ProjectImportStore) *ProjectImport {
	return &ProjectImport{store: store}
}

func (h *ProjectImport) Register(api huma.API) {
	api.OpenAPI().Tags = append(api.OpenAPI().Tags, &huma.Tag{
		Name: "Project Import", Description: "Create a TARA project from a JSON document.",
	})
	op := huma.Operation{
		OperationID: "import-tara-project", Method: http.MethodPost, Path: "/api/v1/projects/import",
		Summary: "Import a TARA project",
		Description: "Creates a new project from a document in the format of the project export, so an exported project can be " +
			"imported again. The caller becomes the first Owner. The import is complete or not at all; a document that breaks a " +
			"reference or a rule is rejected with 422 and the place in the document. Every record gets a new ID: an id is " +
			"only the key that other records use to refer to it. Fields that the server sets itself are optional and ignored.",
		Tags: []string{"Project Import"}, Security: []map[string][]string{{"bearer": {}}},
		DefaultStatus: http.StatusCreated,
		MaxBodyBytes:  10 * 1024 * 1024, // 10 MiB; Huma allows only 1 MiB by default, too little for a large project
	}
	Register(api, op, WithoutProject(), h.Import)
}

// ImportKey is the ID that a document gives a record. It is only needed for a record that another
// record refers to; the import does not keep it.
type ImportKey string

func (ImportKey) Schema(huma.Registry) *huma.Schema {
	maxLength := 100
	return &huma.Schema{
		Type: huma.TypeString, MaxLength: &maxLength,
		Description: "Key of this record in the document, for example the UUID of an export. Only needed if another record refers to it. The import gives the record a new ID.",
	}
}

// IgnoredField is a field that the export writes and the import does not need: the position in the
// document says where a record belongs, and the server sets IDs, times, and versions itself.
type IgnoredField string

func (IgnoredField) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: huma.TypeString, Description: "Ignored: the position in the document tells where the record belongs."}
}

// The Project Import types have the structure of ProjectExportBody. They accept an export unchanged and
// leave out what only the server can know: those fields are optional and ignored, and so are the lists
// without entries. TestImportTypesFollowExportTypes keeps the two in step.

type ProjectImportBody struct {
	FormatVersion int                 `json:"format_version" example:"1" doc:"Version of this document format. The server accepts only the version it writes on export."`
	ExportedAt    *time.Time          `json:"exported_at,omitempty" doc:"Ignored."`
	Project       ProjectImportInfo   `json:"project"`
	Items         []ProjectImportItem `json:"items,omitempty"`
}

type ProjectImportInfo struct {
	ID          IgnoredField `json:"id,omitempty"`
	Name        string       `json:"name" minLength:"1" pattern:"\\S"`
	Description *string      `json:"description,omitempty" nullable:"true"`
	CreatedAt   *time.Time   `json:"created_at,omitempty" doc:"Ignored."`
}

type ProjectImportItem struct {
	ID            IgnoredField `json:"id,omitempty"`
	TaraProjectID IgnoredField `json:"tara_project_id,omitempty"`
	CreatedAt     *time.Time   `json:"created_at,omitempty" doc:"Ignored."`
	ItemDefinitionBody
	Assets          []ProjectImportAsset          `json:"assets,omitempty"`
	DamageScenarios []ProjectImportDamageScenario `json:"damage_scenarios,omitempty"`
	ThreatScenarios []ProjectImportThreatScenario `json:"threat_scenarios,omitempty"`
	AttackPaths     []ProjectImportAttackPath     `json:"attack_paths,omitempty"`
}

type ProjectImportAsset struct {
	ID                      IgnoredField                 `json:"id,omitempty"`
	ItemDefinitionID        IgnoredField                 `json:"item_definition_id,omitempty"`
	Name                    string                       `json:"name"`
	Description             *string                      `json:"description,omitempty" nullable:"true"`
	IdentificationSource    *db.IdentificationSource     `json:"identification_source,omitempty" nullable:"true" enum:"ITEM_DEF,IMPACT_RATING,THREAT_DERIVED,CATALOGUE"`
	CybersecurityProperties []ProjectImportAssetProperty `json:"cybersecurity_properties,omitempty"`
}

type ProjectImportAssetProperty struct {
	ID           ImportKey                    `json:"id,omitempty"`
	AssetID      IgnoredField                 `json:"asset_id,omitempty"`
	PropertyType db.CybersecurityPropertyType `json:"property_type" enum:"CONFIDENTIALITY,INTEGRITY,AVAILABILITY"`
	Description  *string                      `json:"description,omitempty" nullable:"true"`
}

type ProjectImportDamageScenario struct {
	ID                           ImportKey                   `json:"id,omitempty"`
	ItemDefinitionID             IgnoredField                `json:"item_definition_id,omitempty"`
	Title                        string                      `json:"title"`
	FunctionalityAdverseRelation *string                     `json:"functionality_adverse_relation,omitempty"`
	RoadUserHarmDescription      *string                     `json:"road_user_harm_description,omitempty"`
	ImpactRatings                []ProjectImportImpactRating `json:"impact_ratings,omitempty"`
	AssetPropertyLinks           []ProjectImportDamageLink   `json:"asset_property_links,omitempty"`
}

type ProjectImportImpactRating struct {
	ID                         ImportKey             `json:"id,omitempty"`
	DamageScenarioID           IgnoredField          `json:"damage_scenario_id,omitempty"`
	ImpactCategory             db.ImpactCategory     `json:"impact_category" enum:"SAFETY,FINANCIAL,OPERATIONAL,PRIVACY"`
	RatingValue                *db.ImpactRatingValue `json:"rating_value,omitempty" enum:"SEVERE,MAJOR,MODERATE,NEGLIGIBLE,OMITTED"`
	IsOmittedByPm1507          bool                  `json:"is_omitted_by_pm_15_07,omitempty"`
	OmissionOrRatingRationale  *string               `json:"omission_or_rating_rationale,omitempty"`
	ReusedFromFunctionalSafety bool                  `json:"reused_from_functional_safety,omitempty"`
}

type ProjectImportDamageLink struct {
	ID                           IgnoredField `json:"id,omitempty"`
	DamageScenarioID             IgnoredField `json:"damage_scenario_id,omitempty"`
	AssetCybersecurityPropertyID string       `json:"asset_cybersecurity_property_id" minLength:"1" doc:"The id of a cybersecurity property of this item."`
	CompromiseMechanismNote      *string      `json:"compromise_mechanism_note,omitempty" nullable:"true"`
}

type ProjectImportThreatScenario struct {
	ID                          IgnoredField                      `json:"id,omitempty"`
	ItemDefinitionID            IgnoredField                      `json:"item_definition_id,omitempty"`
	Title                       string                            `json:"title"`
	CauseOfCompromise           *string                           `json:"cause_of_compromise,omitempty" nullable:"true"`
	ElicitationMethod           *db.ElicitationMethod             `json:"elicitation_method,omitempty" nullable:"true" enum:"GROUP_DISCUSSION,MALICIOUS_USE_CASE,EVITA,TVRA,PASTA,STRIDE,OTHER"`
	TechnicalNotes              *string                           `json:"technical_notes,omitempty" nullable:"true"`
	AggregatedAttackFeasibility *db.AttackFeasibility             `json:"aggregated_attack_feasibility,omitempty" nullable:"true" enum:"HIGH,MEDIUM,LOW,VERY_LOW"`
	MaxRiskScore                *int32                            `json:"max_risk_score,omitempty" nullable:"true"`
	AssetPropertyLinks          []ProjectImportThreatPropertyLink `json:"asset_property_links,omitempty"`
	DamageScenarioLinks         []ProjectImportThreatDamageLink   `json:"damage_scenario_links,omitempty"`
	AttackPathLinks             []ProjectImportThreatAttackLink   `json:"attack_path_links,omitempty"`
	RiskValues                  []ProjectImportRiskValue          `json:"risk_values,omitempty"`
	RiskTreatmentDecisions      []ProjectImportTreatmentDecision  `json:"risk_treatment_decisions,omitempty"`
}

type ProjectImportThreatPropertyLink struct {
	ID                           IgnoredField `json:"id,omitempty"`
	ThreatScenarioID             IgnoredField `json:"threat_scenario_id,omitempty"`
	AssetCybersecurityPropertyID string       `json:"asset_cybersecurity_property_id" minLength:"1" doc:"The id of a cybersecurity property of this item."`
}

type ProjectImportThreatDamageLink struct {
	ID               IgnoredField `json:"id,omitempty"`
	ThreatScenarioID IgnoredField `json:"threat_scenario_id,omitempty"`
	DamageScenarioID string       `json:"damage_scenario_id" minLength:"1" doc:"The id of a damage scenario of this item."`
}

type ProjectImportThreatAttackLink struct {
	ID               IgnoredField `json:"id,omitempty"`
	ThreatScenarioID IgnoredField `json:"threat_scenario_id,omitempty"`
	AttackPathID     string       `json:"attack_path_id" minLength:"1" doc:"The id of an attack path of this item."`
}

type ProjectImportRiskValue struct {
	ID                  ImportKey                  `json:"id,omitempty"`
	ThreatScenarioID    IgnoredField               `json:"threat_scenario_id,omitempty"`
	ImpactRatingID      string                     `json:"impact_rating_id" minLength:"1" doc:"The id of an impact rating of this item."`
	RiskScore           int32                      `json:"risk_score" minimum:"1" maximum:"5"`
	DeterminationMethod db.RiskDeterminationMethod `json:"determination_method" enum:"RISK_MATRIX,RISK_FORMULA"`
}

type ProjectImportTreatmentDecision struct {
	ID                   IgnoredField           `json:"id,omitempty"`
	ThreatScenarioID     IgnoredField           `json:"threat_scenario_id,omitempty"`
	RiskValueID          *string                `json:"risk_value_id,omitempty" nullable:"true" doc:"The id of a risk value of the same threat scenario."`
	TreatmentOption      db.RiskTreatmentOption `json:"treatment_option" enum:"AVOIDING,REDUCING,SHARING,RETAINING"`
	DecisionRationale    *string                `json:"decision_rationale,omitempty" nullable:"true"`
	IsCybersecurityClaim bool                   `json:"is_cybersecurity_claim,omitempty"`
}

type ProjectImportAttackPath struct {
	ID                       ImportKey                       `json:"id,omitempty"`
	ItemDefinitionID         IgnoredField                    `json:"item_definition_id,omitempty"`
	Title                    string                          `json:"title"`
	AnalysisApproach         *db.AnalysisApproach            `json:"analysis_approach,omitempty" enum:"TOP_DOWN,BOTTOM_UP"`
	IsPartialEarlyStage      bool                            `json:"is_partial_early_stage,omitempty"`
	AttackStepsAndWeaknesses json.RawMessage                 `json:"attack_steps_and_weaknesses,omitempty"`
	FeasibilityRating        *ProjectImportFeasibilityRating `json:"feasibility_rating,omitempty"`
}

type ProjectImportFeasibilityRating struct {
	ID                    IgnoredField          `json:"id,omitempty"`
	AttackPathID          IgnoredField          `json:"attack_path_id,omitempty"`
	ApElapsedTime         *int32                `json:"ap_elapsed_time,omitempty"`
	ApSpecialistExpertise *int32                `json:"ap_specialist_expertise,omitempty"`
	ApKnowledgeOfItem     *int32                `json:"ap_knowledge_of_item,omitempty"`
	ApWindowOfOpportunity *int32                `json:"ap_window_of_opportunity,omitempty"`
	ApEquipment           *int32                `json:"ap_equipment,omitempty"`
	ApTotalScore          *int32                `json:"ap_total_score,omitempty"`
	FeasibilityRating     *db.AttackFeasibility `json:"feasibility_rating,omitempty" enum:"HIGH,MEDIUM,LOW,VERY_LOW"`
	Rationale             *string               `json:"rationale,omitempty"`
}

type ProjectImportInput struct {
	Body ProjectImportBody
}

// Import creates a new project from the document. Every active user may do it, like creating a project.
func (h *ProjectImport) Import(ctx context.Context, in *ProjectImportInput) (*TaraProjectOutput, error) {
	if in.Body.FormatVersion != ExportFormatVersion {
		return nil, huma.Error422UnprocessableEntity(fmt.Sprintf("unsupported format_version %d: this server reads version %d", in.Body.FormatVersion, ExportFormatVersion),
			&huma.ErrorDetail{Location: "body.format_version", Message: "unsupported version", Value: in.Body.FormatVersion})
	}
	actor, err := auditActor(ctx)
	if err != nil {
		return nil, err
	}
	p, err := h.store.ImportProject(ctx, actor, importDocument(in.Body))
	var invalid *db.ImportError
	if errors.As(err, &invalid) {
		return nil, huma.Error422UnprocessableEntity("the document cannot be imported", &huma.ErrorDetail{Location: "body." + invalid.Path, Message: invalid.Message})
	}
	if err != nil {
		return nil, err
	}
	return toTaraProjectOutput(db.TaraProject(p), db.ProjectRoleOWNER), nil
}

func importDocument(body ProjectImportBody) db.ProjectImport {
	out := db.ProjectImport{Name: body.Project.Name, Description: body.Project.Description, FormatVersion: body.FormatVersion}
	for _, item := range body.Items {
		out.Items = append(out.Items, importItem(item))
	}
	return out
}

func importItem(item ProjectImportItem) db.ImportItem {
	out := db.ImportItem{Params: db.CreateItemDefinitionParams{
		Name: item.Name, ScopeType: item.ScopeType, LifecyclePhase: item.LifecyclePhase, Boundary: item.Boundary,
		Functions: item.Functions, OperationalEnvironment: item.OperationalEnvironment, ItemDefinitionWp0901: item.ItemDefinitionWP0901,
		CybersecuritySpecsWp1001: item.CybersecuritySpecsWP1001, ArchitecturalDesign: item.ArchitecturalDesign,
	}}
	for _, asset := range item.Assets {
		a := db.ImportAsset{Params: db.CreateAssetParams{Name: asset.Name, Description: asset.Description, IdentificationSource: asset.IdentificationSource}}
		for _, property := range asset.CybersecurityProperties {
			a.Properties = append(a.Properties, db.ImportProperty{
				Key: string(property.ID), Params: db.CreateAssetCybersecurityPropertyParams{PropertyType: property.PropertyType, Description: property.Description},
			})
		}
		out.Assets = append(out.Assets, a)
	}
	for _, damage := range item.DamageScenarios {
		d := db.ImportDamageScenario{Key: string(damage.ID), Params: db.CreateDamageScenarioParams{
			Title: damage.Title, FunctionalityAdverseRelation: damage.FunctionalityAdverseRelation, RoadUserHarmDescription: damage.RoadUserHarmDescription,
		}}
		for _, rating := range damage.ImpactRatings {
			d.ImpactRatings = append(d.ImpactRatings, db.ImportImpactRating{Key: string(rating.ID), Params: db.CreateImpactRatingParams{
				ImpactCategory: rating.ImpactCategory, RatingValue: rating.RatingValue, IsOmittedByPm1507: rating.IsOmittedByPm1507,
				OmissionOrRatingRationale: rating.OmissionOrRatingRationale, ReusedFromFunctionalSafety: rating.ReusedFromFunctionalSafety,
			}})
		}
		for _, link := range damage.AssetPropertyLinks {
			d.PropertyLinks = append(d.PropertyLinks, db.ImportDamagePropertyLink{PropertyKey: link.AssetCybersecurityPropertyID, Note: link.CompromiseMechanismNote})
		}
		out.DamageScenarios = append(out.DamageScenarios, d)
	}
	for _, path := range item.AttackPaths {
		p := db.ImportAttackPath{Key: string(path.ID), Params: db.CreateAttackPathParams{
			Title: path.Title, AnalysisApproach: path.AnalysisApproach, IsPartialEarlyStage: path.IsPartialEarlyStage,
			AttackStepsAndWeaknesses: path.AttackStepsAndWeaknesses,
		}}
		if r := path.FeasibilityRating; r != nil {
			p.Rating = &db.UpsertAttackFeasibilityRatingParams{
				ApElapsedTime: r.ApElapsedTime, ApSpecialistExpertise: r.ApSpecialistExpertise, ApKnowledgeOfItem: r.ApKnowledgeOfItem,
				ApWindowOfOpportunity: r.ApWindowOfOpportunity, ApEquipment: r.ApEquipment, ApTotalScore: r.ApTotalScore,
				FeasibilityRating: r.FeasibilityRating, Rationale: r.Rationale,
			}
		}
		out.AttackPaths = append(out.AttackPaths, p)
	}
	for _, threat := range item.ThreatScenarios {
		t := db.ImportThreatScenario{Params: db.ImportThreatScenarioParams{
			Title: threat.Title, CauseOfCompromise: threat.CauseOfCompromise, ElicitationMethod: threat.ElicitationMethod,
			TechnicalNotes: threat.TechnicalNotes, AggregatedAttackFeasibility: threat.AggregatedAttackFeasibility, MaxRiskScore: threat.MaxRiskScore,
		}}
		for _, link := range threat.AssetPropertyLinks {
			t.PropertyKeys = append(t.PropertyKeys, link.AssetCybersecurityPropertyID)
		}
		for _, link := range threat.DamageScenarioLinks {
			t.DamageScenarioKeys = append(t.DamageScenarioKeys, link.DamageScenarioID)
		}
		for _, link := range threat.AttackPathLinks {
			t.AttackPathKeys = append(t.AttackPathKeys, link.AttackPathID)
		}
		for _, risk := range threat.RiskValues {
			t.RiskValues = append(t.RiskValues, db.ImportRiskValue{
				Key: string(risk.ID), ImpactRatingKey: risk.ImpactRatingID, RiskScore: risk.RiskScore, Method: risk.DeterminationMethod,
			})
		}
		for _, decision := range threat.RiskTreatmentDecisions {
			d := db.ImportTreatmentDecision{
				TreatmentOption: decision.TreatmentOption, DecisionRationale: decision.DecisionRationale, IsCybersecurityClaim: decision.IsCybersecurityClaim,
			}
			if decision.RiskValueID != nil {
				d.RiskValueKey = *decision.RiskValueID
			}
			t.Decisions = append(t.Decisions, d)
		}
		out.ThreatScenarios = append(out.ThreatScenarios, t)
	}
	return out
}
