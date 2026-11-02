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

type ThreatAttackPathLinkStore interface {
	CreateThreatAttackPathLink(context.Context, db.CreateThreatAttackPathLinkParams) (db.ThreatAttackPathLink, error)
	ListThreatAttackPathLinks(context.Context, pgtype.UUID) ([]db.ThreatAttackPathLink, error)
	DeleteThreatAttackPathLink(context.Context, db.DeleteThreatAttackPathLinkParams) (int64, error)
}

type ThreatAttackPathLink struct {
	store ThreatAttackPathLinkStore
}

func NewThreatAttackPathLink(store ThreatAttackPathLinkStore) *ThreatAttackPathLink {
	return &ThreatAttackPathLink{store: store}
}

func (h *ThreatAttackPathLink) Register(api huma.API) {
	const collection = itemPath + "/threat-attack-path-links"
	const member = collection + "/{id}"
	op := func(id, method, path, summary string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Attack Path"}, Security: []map[string][]string{{"session": {}}}}
	}
	huma.Register(api, op("list-threat-attack-path-links", http.MethodGet, collection, "List threat scenario to attack path links of an item"), h.List)
	create := op("create-threat-attack-path-link", http.MethodPost, collection, "Link a threat scenario to an attack path")
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, h.Create)
	del := op("delete-threat-attack-path-link", http.MethodDelete, member, "Remove a threat scenario to attack path link")
	del.DefaultStatus = http.StatusNoContent
	huma.Register(api, del, h.Delete)
}

type ThreatAttackPathLinkBody struct {
	ID               string `json:"id" format:"uuid"`
	ThreatScenarioID string `json:"threat_scenario_id" format:"uuid"`
	AttackPathID     string `json:"attack_path_id" format:"uuid"`
}

type ThreatAttackPathLinkOutput struct {
	Body ThreatAttackPathLinkBody
}

type ThreatAttackPathLinkListOutput struct {
	Body []ThreatAttackPathLinkBody
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

func (h *ThreatAttackPathLink) Create(ctx context.Context, in *CreateThreatAttackPathLinkInput) (*ThreatAttackPathLinkOutput, error) {
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
	return &ThreatAttackPathLinkOutput{Body: toThreatAttackPathLinkBody(l)}, nil
}

func (h *ThreatAttackPathLink) List(ctx context.Context, in *AttackPathParentPath) (*ThreatAttackPathLinkListOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	links, err := h.store.ListThreatAttackPathLinks(ctx, itemID)
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
