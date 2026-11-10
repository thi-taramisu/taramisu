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

type ThreatAttackPathLinkStore interface {
	CreateThreatAttackPathLink(context.Context, db.CreateThreatAttackPathLinkParams) (db.ThreatAttackPathLink, error)
	ListThreatAttackPathLinks(context.Context, db.ListThreatAttackPathLinksParams) ([]db.ThreatAttackPathLink, error)
	DeleteThreatAttackPathLink(context.Context, db.DeleteThreatAttackPathLinkParams) (int64, error)
}

type ThreatAttackPathLink struct {
	store  ThreatAttackPathLinkStore
	access ProjectAccessStore
}

func NewThreatAttackPathLink(store ThreatAttackPathLinkStore, access ProjectAccessStore) *ThreatAttackPathLink {
	return &ThreatAttackPathLink{store: store, access: access}
}

func (h *ThreatAttackPathLink) Register(api huma.API) {
	const collection = itemPath + "/threat-attack-path-links"
	const member = collection + "/{id}"
	op := func(id, method, path, summary string, status int) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Attack Path"}, Security: []map[string][]string{{"bearer": {}}},
			DefaultStatus: status, Errors: []int{http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity}}
	}
	read := InProject(h.access, ScopeItemDefinition, PermRead)
	edit := InProject(h.access, ScopeItemDefinition, PermEdit)
	Register(api, op("list-threat-attack-path-links", http.MethodGet, collection, "List threat scenario to attack path links of an item (paginated)", http.StatusOK), read, h.List)
	Register(api, op("create-threat-attack-path-link", http.MethodPost, collection, "Link a threat scenario to an attack path", http.StatusCreated), edit, h.Create)
	Register(api, op("delete-threat-attack-path-link", http.MethodDelete, member, "Remove a threat scenario to attack path link", http.StatusNoContent), edit, h.Delete)
}

type ThreatAttackPathLinkBody struct {
	ID               string `json:"id" format:"uuid"`
	ThreatScenarioID string `json:"threat_scenario_id" format:"uuid"`
	AttackPathID     string `json:"attack_path_id" format:"uuid"`
}

type CreateThreatAttackPathLinkOutput struct {
	Location string `header:"Location"`
	Body     ThreatAttackPathLinkBody
}

type ThreatAttackPathLinkListOutput struct {
	Body []ThreatAttackPathLinkBody
}

type ListThreatAttackPathLinksInput struct {
	AttackPathParentPath
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}

type ThreatAttackPathLinkIDInput struct {
	AttackPathParentPath
	ID string `path:"id" format:"uuid"`
}

type CreateThreatAttackPathLinkInput struct {
	AttackPathParentPath
	Body struct {
		ThreatScenarioID string `json:"threat_scenario_id" format:"uuid" minLength:"1"`
		AttackPathID     string `json:"attack_path_id" format:"uuid" minLength:"1"`
	}
}

func (h *ThreatAttackPathLink) Create(ctx context.Context, in *CreateThreatAttackPathLinkInput) (*CreateThreatAttackPathLinkOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	threatID, err := parseUUID(in.Body.ThreatScenarioID)
	if err != nil {
		return nil, err
	}
	pathID, err := parseUUID(in.Body.AttackPathID)
	if err != nil {
		return nil, err
	}
	l, err := h.store.CreateThreatAttackPathLink(ctx, db.CreateThreatAttackPathLinkParams{
		ThreatScenarioID: threatID, AttackPathID: pathID, ItemDefinitionID: itemID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, huma.Error422UnprocessableEntity("threat scenario or attack path not found in this item")
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, huma.Error409Conflict("link already exists")
		}
		return nil, err
	}
	return &CreateThreatAttackPathLinkOutput{
		Location: "/api/v1/item-definitions/" + in.ItemDefinitionID + "/threat-attack-path-links/" + l.ID.String(),
		Body:     toThreatAttackPathLinkBody(l),
	}, nil
}

func (h *ThreatAttackPathLink) List(ctx context.Context, in *ListThreatAttackPathLinksInput) (*ThreatAttackPathLinkListOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	links, err := h.store.ListThreatAttackPathLinks(ctx, db.ListThreatAttackPathLinksParams{ItemDefinitionID: itemID, PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, err
	}
	out := &ThreatAttackPathLinkListOutput{Body: make([]ThreatAttackPathLinkBody, 0, len(links))}
	for _, l := range links {
		out.Body = append(out.Body, toThreatAttackPathLinkBody(l))
	}
	return out, nil
}

func (h *ThreatAttackPathLink) Delete(ctx context.Context, in *ThreatAttackPathLinkIDInput) (*struct{}, error) {
	id, err := parseUUID(in.ID)
	if err != nil {
		return nil, err
	}
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	n, err := h.store.DeleteThreatAttackPathLink(ctx, db.DeleteThreatAttackPathLinkParams{ID: id, ItemDefinitionID: itemID})
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, huma.Error404NotFound("link not found")
	}
	return nil, nil
}

func toThreatAttackPathLinkBody(l db.ThreatAttackPathLink) ThreatAttackPathLinkBody {
	return ThreatAttackPathLinkBody{
		ID:               l.ID.String(),
		ThreatScenarioID: l.ThreatScenarioID.String(),
		AttackPathID:     l.AttackPathID.String(),
	}
}
