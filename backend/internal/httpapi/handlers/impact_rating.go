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

type ImpactRatingStore interface {
	CreateImpactRating(context.Context, db.CreateImpactRatingParams) (db.ImpactRating, error)
	GetImpactRating(context.Context, db.GetImpactRatingParams) (db.ImpactRating, error)
	ListImpactRatings(context.Context, db.ListImpactRatingsParams) ([]db.ImpactRating, error)
	ReplaceImpactRating(context.Context, db.ReplaceImpactRatingParams) (db.ImpactRating, error)
	UpdateImpactRating(context.Context, db.UpdateImpactRatingParams) (db.ImpactRating, error)
	DeleteImpactRating(context.Context, db.DeleteImpactRatingParams) (int64, error)
}

type ImpactRating struct {
	store ImpactRatingStore
}

func NewImpactRating(store ImpactRatingStore) *ImpactRating {
	return &ImpactRating{store: store}
}

func (h *ImpactRating) Register(api huma.API) {
	const collection = "/api/v1/item-definitions/{item_definition_id}/damage-scenarios/{damage_scenario_id}/impact-ratings"
	const member = collection + "/{id}"
	api.OpenAPI().Tags = append(api.OpenAPI().Tags, &huma.Tag{
		Name: "Impact Rating", Description: "Create, read, replace, update and delete the impact ratings of a damage scenario.",
	})
	op := func(id, method, path, summary string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Impact Rating"}, Security: []map[string][]string{{"bearer": {}}}}
	}
	huma.Register(api, op("list-impact-ratings", http.MethodGet, collection, "List impact ratings of a damage scenario"), h.List)
	create := op("create-impact-rating", http.MethodPost, collection, "Create an impact rating")
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, h.Create)
	huma.Register(api, op("get-impact-rating", http.MethodGet, member, "Get an impact rating"), h.Get)
	huma.Register(api, op("replace-impact-rating", http.MethodPut, member, "Replace an impact rating"), h.Replace)
	patch := op("update-impact-rating", http.MethodPatch, member, "Partially update an impact rating")
	patch.Description = "Omitted fields remain unchanged. Only the rationale can be cleared with null; use PUT to clear rating_value."
	huma.Register(api, patch, h.Update)
	del := op("delete-impact-rating", http.MethodDelete, member, "Delete an impact rating")
	del.DefaultStatus = http.StatusNoContent
	huma.Register(api, del, h.Delete)
}

type ImpactRatingBody struct {
	ID                         string                `json:"id" format:"uuid"`
	DamageScenarioID           string                `json:"damage_scenario_id" format:"uuid"`
	ImpactCategory             db.ImpactCategory     `json:"impact_category" enum:"SAFETY,FINANCIAL,OPERATIONAL,PRIVACY"`
	RatingValue                *db.ImpactRatingValue `json:"rating_value,omitempty" enum:"SEVERE,MAJOR,MODERATE,NEGLIGIBLE,OMITTED"`
	IsOmittedByPm1507          bool                  `json:"is_omitted_by_pm_15_07"`
	OmissionOrRatingRationale  *string               `json:"omission_or_rating_rationale,omitempty"`
	ReusedFromFunctionalSafety bool                  `json:"reused_from_functional_safety"`
}

type ImpactRatingOutput struct {
	Body ImpactRatingBody
}

type ImpactRatingListOutput struct {
	Body []ImpactRatingBody
}

type ImpactRatingParent struct {
	ItemDefinitionID string `path:"item_definition_id" format:"uuid"`
	DamageScenarioID string `path:"damage_scenario_id" format:"uuid"`
}

type ImpactRatingIDInput struct {
	ImpactRatingParent
	ID string `path:"id" format:"uuid"`
}

type ImpactRatingFields struct {
	ImpactCategory             db.ImpactCategory     `json:"impact_category" enum:"SAFETY,FINANCIAL,OPERATIONAL,PRIVACY"`
	RatingValue                *db.ImpactRatingValue `json:"rating_value,omitempty" enum:"SEVERE,MAJOR,MODERATE,NEGLIGIBLE,OMITTED"`
	IsOmittedByPm1507          bool                  `json:"is_omitted_by_pm_15_07,omitempty" doc:"Must be true exactly when rating_value is OMITTED."`
	OmissionOrRatingRationale  *string               `json:"omission_or_rating_rationale,omitempty"`
	ReusedFromFunctionalSafety bool                  `json:"reused_from_functional_safety,omitempty" doc:"Only allowed for the SAFETY category."`
}

type CreateImpactRatingInput struct {
	ImpactRatingParent
	Body ImpactRatingFields
}

type ReplaceImpactRatingInput struct {
	ImpactRatingIDInput
	Body ImpactRatingFields
}

type UpdateImpactRatingInput struct {
	ImpactRatingIDInput
	Body struct {
		ImpactCategory             *db.ImpactCategory    `json:"impact_category,omitempty" enum:"SAFETY,FINANCIAL,OPERATIONAL,PRIVACY"`
		RatingValue                *db.ImpactRatingValue `json:"rating_value,omitempty" enum:"SEVERE,MAJOR,MODERATE,NEGLIGIBLE,OMITTED"`
		IsOmittedByPm1507          *bool                 `json:"is_omitted_by_pm_15_07,omitempty"`
		OmissionOrRatingRationale  Optional[string]      `json:"omission_or_rating_rationale,omitempty"`
		ReusedFromFunctionalSafety *bool                 `json:"reused_from_functional_safety,omitempty"`
	}
}

type impactRatingIDs struct{ id, damageScenarioID, itemID pgtype.UUID }

func parseImpactRatingIDs(in *ImpactRatingIDInput) (ids impactRatingIDs, err error) {
	if ids.id, err = parseUUID(in.ID); err != nil {
		return
	}
	if ids.damageScenarioID, err = parseUUID(in.DamageScenarioID); err != nil {
		return
	}
	ids.itemID, err = parseUUID(in.ItemDefinitionID)
	return
}

func (h *ImpactRating) Create(ctx context.Context, in *CreateImpactRatingInput) (*ImpactRatingOutput, error) {
	scenarioID, err := parseUUID(in.DamageScenarioID)
	if err != nil {
		return nil, err
	}
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	r, err := h.store.CreateImpactRating(ctx, db.CreateImpactRatingParams{
		DamageScenarioID:           scenarioID,
		ItemDefinitionID:           itemID,
		ImpactCategory:             in.Body.ImpactCategory,
		RatingValue:                in.Body.RatingValue,
		IsOmittedByPm1507:          in.Body.IsOmittedByPm1507,
		OmissionOrRatingRationale:  in.Body.OmissionOrRatingRationale,
		ReusedFromFunctionalSafety: in.Body.ReusedFromFunctionalSafety,
	})
	if err != nil {
		return nil, mapImpactRatingError(err)
	}
	return toImpactRatingOutput(r), nil
}

func (h *ImpactRating) List(ctx context.Context, in *ImpactRatingParent) (*ImpactRatingListOutput, error) {
	scenarioID, err := parseUUID(in.DamageScenarioID)
	if err != nil {
		return nil, err
	}
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	ratings, err := h.store.ListImpactRatings(ctx, db.ListImpactRatingsParams{DamageScenarioID: scenarioID, ItemDefinitionID: itemID})
	if err != nil {
		return nil, err
	}
	out := &ImpactRatingListOutput{Body: make([]ImpactRatingBody, 0, len(ratings))}
	for _, r := range ratings {
		out.Body = append(out.Body, toImpactRatingBody(r))
	}
	return out, nil
}

func (h *ImpactRating) Get(ctx context.Context, in *ImpactRatingIDInput) (*ImpactRatingOutput, error) {
	ids, err := parseImpactRatingIDs(in)
	if err != nil {
		return nil, err
	}
	r, err := h.store.GetImpactRating(ctx, db.GetImpactRatingParams{ID: ids.id, DamageScenarioID: ids.damageScenarioID, ItemDefinitionID: ids.itemID})
	if err != nil {
		return nil, mapImpactRatingError(err)
	}
	return toImpactRatingOutput(r), nil
}

func (h *ImpactRating) Replace(ctx context.Context, in *ReplaceImpactRatingInput) (*ImpactRatingOutput, error) {
	ids, err := parseImpactRatingIDs(&in.ImpactRatingIDInput)
	if err != nil {
		return nil, err
	}
	r, err := h.store.ReplaceImpactRating(ctx, db.ReplaceImpactRatingParams{
		ID:                         ids.id,
		DamageScenarioID:           ids.damageScenarioID,
		ItemDefinitionID:           ids.itemID,
		ImpactCategory:             in.Body.ImpactCategory,
		RatingValue:                in.Body.RatingValue,
		IsOmittedByPm1507:          in.Body.IsOmittedByPm1507,
		OmissionOrRatingRationale:  in.Body.OmissionOrRatingRationale,
		ReusedFromFunctionalSafety: in.Body.ReusedFromFunctionalSafety,
	})
	if err != nil {
		return nil, mapImpactRatingError(err)
	}
	return toImpactRatingOutput(r), nil
}

func (h *ImpactRating) Update(ctx context.Context, in *UpdateImpactRatingInput) (*ImpactRatingOutput, error) {
	ids, err := parseImpactRatingIDs(&in.ImpactRatingIDInput)
	if err != nil {
		return nil, err
	}
	r, err := h.store.UpdateImpactRating(ctx, db.UpdateImpactRatingParams{
		ID:                           ids.id,
		DamageScenarioID:             ids.damageScenarioID,
		ItemDefinitionID:             ids.itemID,
		ImpactCategory:               in.Body.ImpactCategory,
		RatingValue:                  in.Body.RatingValue,
		IsOmittedByPm1507:            in.Body.IsOmittedByPm1507,
		SetOmissionOrRatingRationale: in.Body.OmissionOrRatingRationale.Set,
		OmissionOrRatingRationale:    in.Body.OmissionOrRatingRationale.Value,
		ReusedFromFunctionalSafety:   in.Body.ReusedFromFunctionalSafety,
	})
	if err != nil {
		return nil, mapImpactRatingError(err)
	}
	return toImpactRatingOutput(r), nil
}

func (h *ImpactRating) Delete(ctx context.Context, in *ImpactRatingIDInput) (*struct{}, error) {
	ids, err := parseImpactRatingIDs(in)
	if err != nil {
		return nil, err
	}
	n, err := h.store.DeleteImpactRating(ctx, db.DeleteImpactRatingParams{ID: ids.id, DamageScenarioID: ids.damageScenarioID, ItemDefinitionID: ids.itemID})
	if err != nil {
		return nil, mapImpactRatingError(err)
	}
	if n == 0 {
		return nil, huma.Error404NotFound("impact rating not found")
	}
	return nil, nil
}

func mapImpactRatingError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("impact rating or damage scenario not found")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // unique_violation: one rating per category and damage scenario
			return huma.Error409Conflict("the damage scenario already has an impact rating for this category")
		case "23514": // check_violation
			return huma.Error422UnprocessableEntity("is_omitted_by_pm_15_07 must be true exactly when rating_value is OMITTED, and reused_from_functional_safety is only allowed for the SAFETY category")
		}
	}
	return err
}

func toImpactRatingBody(r db.ImpactRating) ImpactRatingBody {
	return ImpactRatingBody{
		ID:                         r.ID.String(),
		DamageScenarioID:           r.DamageScenarioID.String(),
		ImpactCategory:             r.ImpactCategory,
		RatingValue:                r.RatingValue,
		IsOmittedByPm1507:          r.IsOmittedByPm1507,
		OmissionOrRatingRationale:  r.OmissionOrRatingRationale,
		ReusedFromFunctionalSafety: r.ReusedFromFunctionalSafety,
	}
}

func toImpactRatingOutput(r db.ImpactRating) *ImpactRatingOutput {
	return &ImpactRatingOutput{Body: toImpactRatingBody(r)}
}
