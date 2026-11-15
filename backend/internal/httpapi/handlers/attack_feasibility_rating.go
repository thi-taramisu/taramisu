package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// AttackFeasibilityRatingStore exposes the sqlc operations used by the HTTP handlers.
// The write queries calculate feasibility; table constraints validate method inputs.
type AttackFeasibilityRatingStore interface {
	GetAttackFeasibilityRating(context.Context, pgtype.UUID) (db.AttackFeasibilityRating, error)
	UpsertAttackFeasibilityRating(context.Context, db.UpsertAttackFeasibilityRatingParams) (db.AttackFeasibilityRating, error)
	UpdateAttackFeasibilityRating(context.Context, db.UpdateAttackFeasibilityRatingParams) (db.AttackFeasibilityRating, error)
	DeleteAttackFeasibilityRating(context.Context, pgtype.UUID) (int64, error)
	AttackPathBelongsToItem(context.Context, db.AttackPathBelongsToItemParams) (bool, error)
}

type AttackFeasibilityRating struct {
	store  AttackFeasibilityRatingStore
	access ProjectAccessStore
}

func NewAttackFeasibilityRating(store AttackFeasibilityRatingStore, access ProjectAccessStore) *AttackFeasibilityRating {
	return &AttackFeasibilityRating{store: store, access: access}
}

func (h *AttackFeasibilityRating) Register(api huma.API) {
	const path = itemPath + "/attack-paths/{attack_path_id}/feasibility-rating"
	op := func(id, method, summary string, status int) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Description: "Rating method and inputs are stored together. CVSS uses v3.1 exploitability. feasibility_rating is derived; any supplied value is ignored. PUT defaults rating_method to ATTACK_POTENTIAL.",
			Tags:        []string{"Attack Path"}, Security: []map[string][]string{{"bearer": {}}},
			DefaultStatus: status, Errors: []int{http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity}}
	}
	read := InProject(h.access, ScopeItemDefinition, PermRead)
	edit := InProject(h.access, ScopeItemDefinition, PermEdit)
	Register(api, op("get-attack-feasibility-rating", http.MethodGet, "Get the attack feasibility rating of an attack path", http.StatusOK), read, h.Get)
	Register(api, op("replace-attack-feasibility-rating", http.MethodPut, "Create or replace the attack feasibility rating of an attack path", http.StatusOK), edit, h.Upsert)
	patch := op("update-attack-feasibility-rating", http.MethodPatch, "Partially update the attack feasibility rating of an attack path", http.StatusOK)
	patch.Description = "Omitted fields remain unchanged. All fields except rating_method can be cleared with null. Method changes must clear incompatible inputs and supply the new method inputs in the same request. feasibility_rating is derived from complete inputs."
	Register(api, patch, edit, h.Update)
	Register(api, op("delete-attack-feasibility-rating", http.MethodDelete, "Delete the attack feasibility rating of an attack path", http.StatusNoContent), edit, h.Delete)
}

// AttackFeasibilityRatingBody returns the selected method, its inputs, and the stored result.
// Pointer fields represent nullable database columns; unused method inputs are omitted.
type AttackFeasibilityRatingBody struct {
	RatingMethod           string  `json:"rating_method,omitempty" enum:"ATTACK_POTENTIAL,CVSS,ATTACK_VECTOR"`
	CvssAttackVector       *string `json:"cvss_attack_vector,omitempty" enum:"NETWORK,ADJACENT,LOCAL,PHYSICAL"`
	CvssAttackComplexity   *string `json:"cvss_attack_complexity,omitempty" enum:"LOW,HIGH"`
	CvssPrivilegesRequired *string `json:"cvss_privileges_required,omitempty" enum:"NONE,LOW,HIGH"`
	CvssUserInteraction    *string `json:"cvss_user_interaction,omitempty" enum:"NONE,REQUIRED"`
	// Scope changes the CVSS v3.1 weight for low or high privileges.
	CvssScope             *string               `json:"cvss_scope,omitempty" enum:"UNCHANGED,CHANGED"`
	AttackVector          *string               `json:"attack_vector,omitempty" enum:"NETWORK,ADJACENT,LOCAL,PHYSICAL"`
	ID                    string                `json:"id" format:"uuid"`
	AttackPathID          string                `json:"attack_path_id" format:"uuid"`
	ApElapsedTime         *int32                `json:"ap_elapsed_time,omitempty"`
	ApSpecialistExpertise *int32                `json:"ap_specialist_expertise,omitempty"`
	ApKnowledgeOfItem     *int32                `json:"ap_knowledge_of_item,omitempty"`
	ApWindowOfOpportunity *int32                `json:"ap_window_of_opportunity,omitempty"`
	ApEquipment           *int32                `json:"ap_equipment,omitempty"`
	ApTotalScore          *int32                `json:"ap_total_score,omitempty"`
	FeasibilityRating     *db.AttackFeasibility `json:"feasibility_rating,omitempty" enum:"HIGH,MEDIUM,LOW,VERY_LOW"`
	Rationale             *string               `json:"rationale,omitempty"`
}

type AttackFeasibilityRatingOutput struct {
	Body AttackFeasibilityRatingBody
}

type FeasibilityRatingPath struct {
	AttackPathParentPath
	AttackPathID string `path:"attack_path_id" format:"uuid"`
}

// FeasibilityRatingUpdateInput distinguishes omitted PATCH fields from explicit null:
// Set=false keeps the stored value; Set=true with Value=nil clears it.
type FeasibilityRatingUpdateInput struct {
	FeasibilityRatingPath
	Body struct {
		RatingMethod           Optional[string]               `json:"rating_method,omitempty" enum:"ATTACK_POTENTIAL,CVSS,ATTACK_VECTOR"`
		CvssAttackVector       Optional[string]               `json:"cvss_attack_vector,omitempty" enum:"NETWORK,ADJACENT,LOCAL,PHYSICAL"`
		CvssAttackComplexity   Optional[string]               `json:"cvss_attack_complexity,omitempty" enum:"LOW,HIGH"`
		CvssPrivilegesRequired Optional[string]               `json:"cvss_privileges_required,omitempty" enum:"NONE,LOW,HIGH"`
		CvssUserInteraction    Optional[string]               `json:"cvss_user_interaction,omitempty" enum:"NONE,REQUIRED"`
		CvssScope              Optional[string]               `json:"cvss_scope,omitempty" enum:"UNCHANGED,CHANGED"`
		AttackVector           Optional[string]               `json:"attack_vector,omitempty" enum:"NETWORK,ADJACENT,LOCAL,PHYSICAL"`
		ApElapsedTime          Optional[int32]                `json:"ap_elapsed_time,omitempty" minimum:"0"`
		ApSpecialistExpertise  Optional[int32]                `json:"ap_specialist_expertise,omitempty" minimum:"0"`
		ApKnowledgeOfItem      Optional[int32]                `json:"ap_knowledge_of_item,omitempty" minimum:"0"`
		ApWindowOfOpportunity  Optional[int32]                `json:"ap_window_of_opportunity,omitempty" minimum:"0"`
		ApEquipment            Optional[int32]                `json:"ap_equipment,omitempty" minimum:"0"`
		ApTotalScore           Optional[int32]                `json:"ap_total_score,omitempty" minimum:"0"`
		FeasibilityRating      Optional[db.AttackFeasibility] `json:"feasibility_rating,omitempty" enum:"HIGH,MEDIUM,LOW,VERY_LOW"`
		Rationale              Optional[string]               `json:"rationale,omitempty"`
	}
}

// FeasibilityRatingInput replaces the complete rating on PUT. Missing pointer fields
// become NULL, so clients must include all inputs required by their chosen method.
type FeasibilityRatingInput struct {
	FeasibilityRatingPath
	Body struct {
		RatingMethod           string                `json:"rating_method,omitempty" enum:"ATTACK_POTENTIAL,CVSS,ATTACK_VECTOR"`
		CvssAttackVector       *string               `json:"cvss_attack_vector,omitempty" enum:"NETWORK,ADJACENT,LOCAL,PHYSICAL"`
		CvssAttackComplexity   *string               `json:"cvss_attack_complexity,omitempty" enum:"LOW,HIGH"`
		CvssPrivilegesRequired *string               `json:"cvss_privileges_required,omitempty" enum:"NONE,LOW,HIGH"`
		CvssUserInteraction    *string               `json:"cvss_user_interaction,omitempty" enum:"NONE,REQUIRED"`
		CvssScope              *string               `json:"cvss_scope,omitempty" enum:"UNCHANGED,CHANGED"`
		AttackVector           *string               `json:"attack_vector,omitempty" enum:"NETWORK,ADJACENT,LOCAL,PHYSICAL"`
		ApElapsedTime          *int32                `json:"ap_elapsed_time,omitempty" minimum:"0"`
		ApSpecialistExpertise  *int32                `json:"ap_specialist_expertise,omitempty" minimum:"0"`
		ApKnowledgeOfItem      *int32                `json:"ap_knowledge_of_item,omitempty" minimum:"0"`
		ApWindowOfOpportunity  *int32                `json:"ap_window_of_opportunity,omitempty" minimum:"0"`
		ApEquipment            *int32                `json:"ap_equipment,omitempty" minimum:"0"`
		ApTotalScore           *int32                `json:"ap_total_score,omitempty" minimum:"0"`
		FeasibilityRating      *db.AttackFeasibility `json:"feasibility_rating,omitempty" enum:"HIGH,MEDIUM,LOW,VERY_LOW"`
		Rationale              *string               `json:"rationale,omitempty"`
	}
}

// ratingPath checks that the attack path belongs to the item named in the URL.
// Project permissions are checked separately by the registered route middleware.
func (h *AttackFeasibilityRating) ratingPath(ctx context.Context, in *FeasibilityRatingPath) (id, itemID pgtype.UUID, err error) {
	if id, err = parseUUID(in.AttackPathID); err != nil {
		return
	}
	if itemID, err = parseUUID(in.ItemDefinitionID); err != nil {
		return
	}
	var ok bool
	if ok, err = h.store.AttackPathBelongsToItem(ctx, db.AttackPathBelongsToItemParams{
		ID: id, ItemDefinitionID: itemID,
	}); err != nil {
		return
	}
	if !ok {
		err = huma.Error404NotFound("attack path not found")
	}
	return
}

func (h *AttackFeasibilityRating) Get(ctx context.Context, in *FeasibilityRatingPath) (*AttackFeasibilityRatingOutput, error) {
	id, _, err := h.ratingPath(ctx, in)
	if err != nil {
		return nil, err
	}
	r, err := h.store.GetAttackFeasibilityRating(ctx, id)
	if err != nil {
		return nil, mapRatingError(err)
	}
	return toRatingOutput(r), nil
}

func (h *AttackFeasibilityRating) Upsert(ctx context.Context, in *FeasibilityRatingInput) (*AttackFeasibilityRatingOutput, error) {
	id, _, err := h.ratingPath(ctx, &in.FeasibilityRatingPath)
	if err != nil {
		return nil, err
	}
	// Preserve the attack-potential default for clients that omit the method.
	if in.Body.RatingMethod == "" {
		in.Body.RatingMethod = "ATTACK_POTENTIAL"
	}
	// Save method and inputs together. SQL derives the result, ignoring a supplied
	// feasibility_rating; constraints reject missing or incompatible method inputs.
	r, err := h.store.UpsertAttackFeasibilityRating(ctx, db.UpsertAttackFeasibilityRatingParams{
		AttackPathID:           id,
		RatingMethod:           in.Body.RatingMethod,
		CvssAttackVector:       in.Body.CvssAttackVector,
		CvssAttackComplexity:   in.Body.CvssAttackComplexity,
		CvssPrivilegesRequired: in.Body.CvssPrivilegesRequired,
		CvssUserInteraction:    in.Body.CvssUserInteraction,
		CvssScope:              in.Body.CvssScope,
		AttackVector:           in.Body.AttackVector,

		ApElapsedTime:         in.Body.ApElapsedTime,
		ApSpecialistExpertise: in.Body.ApSpecialistExpertise,
		ApKnowledgeOfItem:     in.Body.ApKnowledgeOfItem,
		ApWindowOfOpportunity: in.Body.ApWindowOfOpportunity,
		ApEquipment:           in.Body.ApEquipment,
		ApTotalScore:          in.Body.ApTotalScore,
		FeasibilityRating:     in.Body.FeasibilityRating,
		Rationale:             in.Body.Rationale,
	})
	if err != nil {
		return nil, mapRatingError(err)
	}
	return toRatingOutput(r), nil
}

func (h *AttackFeasibilityRating) Update(ctx context.Context, in *FeasibilityRatingUpdateInput) (*AttackFeasibilityRatingOutput, error) {
	id, _, err := h.ratingPath(ctx, &in.FeasibilityRatingPath)
	if err != nil {
		return nil, err
	}
	b := in.Body
	// A PATCH can leave the method unchanged, but cannot clear this required column.
	if b.RatingMethod.Set && b.RatingMethod.Value == nil {
		return nil, huma.Error422UnprocessableEntity("rating_method cannot be null")
	}
	// Pass both presence flags and values to SQL. It locks the current row, merges
	// the patch, and recalculates feasibility in the same statement. A method switch
	// must clear old inputs and supply the new inputs together to satisfy constraints.
	r, err := h.store.UpdateAttackFeasibilityRating(ctx, db.UpdateAttackFeasibilityRatingParams{
		AttackPathID:              id,
		SetRatingMethod:           b.RatingMethod.Set,
		RatingMethod:              b.RatingMethod.Value,
		SetCvssAttackVector:       b.CvssAttackVector.Set,
		CvssAttackVector:          b.CvssAttackVector.Value,
		SetCvssAttackComplexity:   b.CvssAttackComplexity.Set,
		CvssAttackComplexity:      b.CvssAttackComplexity.Value,
		SetCvssPrivilegesRequired: b.CvssPrivilegesRequired.Set,
		CvssPrivilegesRequired:    b.CvssPrivilegesRequired.Value,
		SetCvssUserInteraction:    b.CvssUserInteraction.Set,
		CvssUserInteraction:       b.CvssUserInteraction.Value,
		SetCvssScope:              b.CvssScope.Set,
		CvssScope:                 b.CvssScope.Value,
		SetAttackVector:           b.AttackVector.Set,
		AttackVector:              b.AttackVector.Value,

		SetApElapsedTime:         b.ApElapsedTime.Set,
		ApElapsedTime:            b.ApElapsedTime.Value,
		SetApSpecialistExpertise: b.ApSpecialistExpertise.Set,
		ApSpecialistExpertise:    b.ApSpecialistExpertise.Value,
		SetApKnowledgeOfItem:     b.ApKnowledgeOfItem.Set,
		ApKnowledgeOfItem:        b.ApKnowledgeOfItem.Value,
		SetApWindowOfOpportunity: b.ApWindowOfOpportunity.Set,
		ApWindowOfOpportunity:    b.ApWindowOfOpportunity.Value,
		SetApEquipment:           b.ApEquipment.Set,
		ApEquipment:              b.ApEquipment.Value,
		SetApTotalScore:          b.ApTotalScore.Set,
		ApTotalScore:             b.ApTotalScore.Value,
		SetFeasibilityRating:     b.FeasibilityRating.Set,
		FeasibilityRating:        b.FeasibilityRating.Value,
		SetRationale:             b.Rationale.Set,
		Rationale:                b.Rationale.Value,
	})
	if err != nil {
		return nil, mapRatingError(err)
	}
	return toRatingOutput(r), nil
}

func (h *AttackFeasibilityRating) Delete(ctx context.Context, in *FeasibilityRatingPath) (*struct{}, error) {
	id, _, err := h.ratingPath(ctx, in)
	if err != nil {
		return nil, err
	}
	n, err := h.store.DeleteAttackFeasibilityRating(ctx, id)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, huma.Error404NotFound("attack feasibility rating not found")
	}
	return nil, nil
}

func mapRatingError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("attack feasibility rating not found")
	}
	var pgErr *pgconn.PgError
	// PostgreSQL 23514 means a CHECK constraint rejected the proposed rating.
	if errors.As(err, &pgErr) && pgErr.Code == "23514" {
		return huma.Error422UnprocessableEntity("invalid feasibility rating: check method inputs and attack potential total")
	}
	return err
}

// toRatingBody maps the database result to JSON, including the feasibility value
// calculated by the write query rather than any client-supplied rating.
func toRatingBody(r db.AttackFeasibilityRating) AttackFeasibilityRatingBody {
	out := AttackFeasibilityRatingBody{
		ID:                     r.ID.String(),
		RatingMethod:           r.RatingMethod,
		CvssAttackVector:       r.CvssAttackVector,
		CvssAttackComplexity:   r.CvssAttackComplexity,
		CvssPrivilegesRequired: r.CvssPrivilegesRequired,
		CvssUserInteraction:    r.CvssUserInteraction,
		CvssScope:              r.CvssScope,
		AttackVector:           r.AttackVector,

		AttackPathID:          r.AttackPathID.String(),
		ApElapsedTime:         r.ApElapsedTime,
		ApSpecialistExpertise: r.ApSpecialistExpertise,
		ApKnowledgeOfItem:     r.ApKnowledgeOfItem,
		ApWindowOfOpportunity: r.ApWindowOfOpportunity,
		ApEquipment:           r.ApEquipment,
		ApTotalScore:          r.ApTotalScore,
		Rationale:             r.Rationale,
	}
	out.FeasibilityRating = r.FeasibilityRating
	return out
}

func toRatingOutput(r db.AttackFeasibilityRating) *AttackFeasibilityRatingOutput {
	return &AttackFeasibilityRatingOutput{Body: toRatingBody(r)}
}
