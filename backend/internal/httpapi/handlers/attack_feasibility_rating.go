package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type AttackFeasibilityRatingStore interface {
	GetAttackFeasibilityRating(context.Context, pgtype.UUID) (db.AttackFeasibilityRating, error)
	UpsertAttackFeasibilityRating(context.Context, db.UpsertAttackFeasibilityRatingParams) (db.AttackFeasibilityRating, error)
	UpdateAttackFeasibilityRating(context.Context, db.UpdateAttackFeasibilityRatingParams) (db.AttackFeasibilityRating, error)
	DeleteAttackFeasibilityRating(context.Context, pgtype.UUID) (int64, error)
	AttackPathBelongsToItem(context.Context, db.AttackPathBelongsToItemParams) (bool, error)
}

type AttackFeasibilityRating struct {
	store AttackFeasibilityRatingStore
}

func NewAttackFeasibilityRating(store AttackFeasibilityRatingStore) *AttackFeasibilityRating {
	return &AttackFeasibilityRating{store: store}
}

func (h *AttackFeasibilityRating) Register(api huma.API) {
	const path = itemPath + "/attack-paths/{attack_path_id}/feasibility-rating"
	op := func(id, method, summary string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Attack Path"}, Security: []map[string][]string{{"session": {}}}}
	}
	huma.Register(api, op("get-attack-feasibility-rating", http.MethodGet, "Get the attack feasibility rating of an attack path"), h.Get)
	huma.Register(api, op("replace-attack-feasibility-rating", http.MethodPut, "Create or replace the attack feasibility rating of an attack path"), h.Upsert)
	patch := op("update-attack-feasibility-rating", http.MethodPatch, "Partially update the attack feasibility rating of an attack path")
	patch.Description = "Omitted fields remain unchanged. Nullable fields cannot be cleared with PATCH; use PUT."
	huma.Register(api, patch, h.Update)
	del := op("delete-attack-feasibility-rating", http.MethodDelete, "Delete the attack feasibility rating of an attack path")
	del.DefaultStatus = http.StatusNoContent
	huma.Register(api, del, h.Delete)
}

type AttackFeasibilityRatingBody struct {
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

type FeasibilityRatingInput struct {
	FeasibilityRatingPath
	Body struct {
		ApElapsedTime         *int32                `json:"ap_elapsed_time,omitempty" minimum:"0"`
		ApSpecialistExpertise *int32                `json:"ap_specialist_expertise,omitempty" minimum:"0"`
		ApKnowledgeOfItem     *int32                `json:"ap_knowledge_of_item,omitempty" minimum:"0"`
		ApWindowOfOpportunity *int32                `json:"ap_window_of_opportunity,omitempty" minimum:"0"`
		ApEquipment           *int32                `json:"ap_equipment,omitempty" minimum:"0"`
		ApTotalScore          *int32                `json:"ap_total_score,omitempty" minimum:"0"`
		FeasibilityRating     *db.AttackFeasibility `json:"feasibility_rating,omitempty" enum:"HIGH,MEDIUM,LOW,VERY_LOW"`
		Rationale             *string               `json:"rationale,omitempty"`
	}
}

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
	r, err := h.store.UpsertAttackFeasibilityRating(ctx, db.UpsertAttackFeasibilityRatingParams{
		AttackPathID:          id,
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

func (h *AttackFeasibilityRating) Update(ctx context.Context, in *FeasibilityRatingInput) (*AttackFeasibilityRatingOutput, error) {
	id, _, err := h.ratingPath(ctx, &in.FeasibilityRatingPath)
	if err != nil {
		return nil, err
	}
	r, err := h.store.UpdateAttackFeasibilityRating(ctx, db.UpdateAttackFeasibilityRatingParams{
		AttackPathID:          id,
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
	return err
}

func toRatingBody(r db.AttackFeasibilityRating) AttackFeasibilityRatingBody {
	out := AttackFeasibilityRatingBody{
		ID:                    r.ID.String(),
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
