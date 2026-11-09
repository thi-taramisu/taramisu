package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type ThreatDamageLinkStore interface {
	CreateThreatDamageLink(context.Context, db.CreateThreatDamageLinkParams) (db.ThreatDamageLink, error)
	ListThreatDamageLinks(context.Context, db.ListThreatDamageLinksParams) ([]db.ThreatDamageLink, error)
	DeleteThreatDamageLink(context.Context, db.DeleteThreatDamageLinkParams) (int64, error)
}

type ThreatDamageLink struct {
	store ThreatDamageLinkStore
}

func NewThreatDamageLink(store ThreatDamageLinkStore) *ThreatDamageLink {
	return &ThreatDamageLink{store: store}
}

func (h *ThreatDamageLink) Register(api huma.API) {
	const collection = "/api/v1/item-definitions/{item_definition_id}/threat-damage-links"
	const member = collection + "/{id}"
	op := func(id, method, path, summary string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Damage Scenario"}, Security: []map[string][]string{{"bearer": {}}}}
	}
	huma.Register(api, op("list-threat-damage-links", http.MethodGet, collection, "List threat scenario to damage scenario links of an item definition (paginated)"), h.List)
	create := op("create-threat-damage-link", http.MethodPost, collection, "Link a threat scenario to a damage scenario")
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, h.Create)
	del := op("delete-threat-damage-link", http.MethodDelete, member, "Remove a threat scenario to damage scenario link")
	del.DefaultStatus = http.StatusNoContent
	huma.Register(api, del, h.Delete)
}

type ThreatDamageLinkBody struct {
	ID               string `json:"id" format:"uuid"`
	ThreatScenarioID string `json:"threat_scenario_id" format:"uuid"`
	DamageScenarioID string `json:"damage_scenario_id" format:"uuid"`
}

type ThreatDamageLinkOutput struct {
	Body ThreatDamageLinkBody
}

type ThreatDamageLinkListOutput struct {
	Body []ThreatDamageLinkBody
}

type ThreatDamageLinkParent struct {
	ItemDefinitionID string `path:"item_definition_id" format:"uuid"`
}

type ListThreatDamageLinksInput struct {
	ThreatDamageLinkParent
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}

type ThreatDamageLinkIDInput struct {
	ThreatDamageLinkParent
	ID string `path:"id" format:"uuid"`
}

type CreateThreatDamageLinkInput struct {
	ThreatDamageLinkParent
	Body struct {
		ThreatScenarioID string `json:"threat_scenario_id" format:"uuid"`
		DamageScenarioID string `json:"damage_scenario_id" format:"uuid"`
	}
}

func (h *ThreatDamageLink) Create(ctx context.Context, in *CreateThreatDamageLinkInput) (*ThreatDamageLinkOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	threatID, err := parseUUID(in.Body.ThreatScenarioID)
	if err != nil {
		return nil, err
	}
	damageID, err := parseUUID(in.Body.DamageScenarioID)
	if err != nil {
		return nil, err
	}
	l, err := h.store.CreateThreatDamageLink(ctx, db.CreateThreatDamageLinkParams{
		ThreatScenarioID: threatID, DamageScenarioID: damageID, ItemDefinitionID: itemID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, huma.Error422UnprocessableEntity("threat scenario or damage scenario not found in this item definition")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return nil, huma.Error409Conflict("link already exists")
	}
	if err != nil {
		return nil, err
	}
	return &ThreatDamageLinkOutput{Body: toThreatDamageLinkBody(l)}, nil
}

func (h *ThreatDamageLink) List(ctx context.Context, in *ListThreatDamageLinksInput) (*ThreatDamageLinkListOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	links, err := h.store.ListThreatDamageLinks(ctx, db.ListThreatDamageLinksParams{ItemDefinitionID: itemID, PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, err
	}
	out := &ThreatDamageLinkListOutput{Body: make([]ThreatDamageLinkBody, 0, len(links))}
	for _, l := range links {
		out.Body = append(out.Body, toThreatDamageLinkBody(l))
	}
	return out, nil
}

func (h *ThreatDamageLink) Delete(ctx context.Context, in *ThreatDamageLinkIDInput) (*struct{}, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	id, err := parseUUID(in.ID)
	if err != nil {
		return nil, err
	}
	n, err := h.store.DeleteThreatDamageLink(ctx, db.DeleteThreatDamageLinkParams{ID: id, ItemDefinitionID: itemID})
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, huma.Error404NotFound("link not found")
	}
	return nil, nil
}

func toThreatDamageLinkBody(l db.ThreatDamageLink) ThreatDamageLinkBody {
	return ThreatDamageLinkBody{ID: l.ID.String(), ThreatScenarioID: l.ThreatScenarioID.String(), DamageScenarioID: l.DamageScenarioID.String()}
}
