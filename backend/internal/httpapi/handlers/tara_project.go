package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type TaraProjectStore interface {
	CreateTaraProject(context.Context, db.CreateTaraProjectParams) (db.TaraProject, error)
	GetTaraProject(context.Context, pgtype.UUID) (db.TaraProject, error)
	ListTaraProjects(context.Context) ([]db.TaraProject, error)
	ReplaceTaraProject(context.Context, db.ReplaceTaraProjectParams) (db.TaraProject, error)
	UpdateTaraProject(context.Context, db.UpdateTaraProjectParams) (db.TaraProject, error)
	DeleteTaraProject(context.Context, pgtype.UUID) (int64, error)
}

type TaraProject struct {
	store TaraProjectStore
}

func NewTaraProject(store TaraProjectStore) *TaraProject {
	return &TaraProject{store: store}
}

func (h *TaraProject) Register(api huma.API) {
	const collection = "/api/tara-projects"
	const member = collection + "/{id}"
	api.OpenAPI().Tags = append(api.OpenAPI().Tags, &huma.Tag{
		Name: "Tara Project", Description: "Create, read, replace, update and delete TARA projects.",
	})
	op := func(id, method, path, summary string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Tara Project"}, Security: []map[string][]string{{"session": {}}}}
	}
	huma.Register(api, op("list-tara-projects", http.MethodGet, collection, "List TARA projects"), h.List)
	create := op("create-tara-project", http.MethodPost, collection, "Create a TARA project")
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, h.Create)
	huma.Register(api, op("get-tara-project", http.MethodGet, member, "Get a TARA project"), h.Get)
	huma.Register(api, op("replace-tara-project", http.MethodPut, member, "Replace a TARA project"), h.Replace)
	huma.Register(api, op("update-tara-project", http.MethodPatch, member, "Partially update a TARA project"), h.Update)
	del := op("delete-tara-project", http.MethodDelete, member, "Delete a TARA project")
	del.DefaultStatus = http.StatusNoContent
	huma.Register(api, del, h.Delete)
}

type TaraProjectBody struct {
	ID          string    `json:"id" format:"uuid"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type TaraProjectOutput struct {
	Body TaraProjectBody
}

type TaraProjectListOutput struct {
	Body []TaraProjectBody
}

type TaraProjectIDInput struct {
	ID string `path:"id" format:"uuid"`
}

type CreateTaraProjectInput struct {
	Body struct {
		Name        string  `json:"name" minLength:"1"`
		Description *string `json:"description,omitempty"`
	}
}

type ReplaceTaraProjectInput struct {
	ID   string `path:"id" format:"uuid"`
	Body struct {
		Name        string  `json:"name" minLength:"1"`
		Description *string `json:"description,omitempty"`
	}
}

type UpdateTaraProjectInput struct {
	ID   string `path:"id" format:"uuid"`
	Body struct {
		Name        *string `json:"name,omitempty" minLength:"1"`
		Description *string `json:"description,omitempty"`
	}
}

func (h *TaraProject) Create(ctx context.Context, in *CreateTaraProjectInput) (*TaraProjectOutput, error) {
	p, err := h.store.CreateTaraProject(ctx, db.CreateTaraProjectParams{
		Name:        in.Body.Name,
		Description: in.Body.Description,
	})
	if err != nil {
		return nil, err
	}
	return toTaraProjectOutput(p), nil
}

func (h *TaraProject) List(ctx context.Context, _ *struct{}) (*TaraProjectListOutput, error) {
	projects, err := h.store.ListTaraProjects(ctx)
	if err != nil {
		return nil, err
	}
	out := &TaraProjectListOutput{Body: make([]TaraProjectBody, 0, len(projects))}
	for _, p := range projects {
		out.Body = append(out.Body, toTaraProjectBody(p))
	}
	return out, nil
}

func (h *TaraProject) Get(ctx context.Context, in *TaraProjectIDInput) (*TaraProjectOutput, error) {
	id, err := parseUUID(in.ID)
	if err != nil {
		return nil, err
	}
	p, err := h.store.GetTaraProject(ctx, id)
	if err != nil {
		return nil, mapTaraProjectError(err)
	}
	return toTaraProjectOutput(p), nil
}

func (h *TaraProject) Replace(ctx context.Context, in *ReplaceTaraProjectInput) (*TaraProjectOutput, error) {
	id, err := parseUUID(in.ID)
	if err != nil {
		return nil, err
	}
	p, err := h.store.ReplaceTaraProject(ctx, db.ReplaceTaraProjectParams{
		ID:          id,
		Name:        in.Body.Name,
		Description: in.Body.Description,
	})
	if err != nil {
		return nil, mapTaraProjectError(err)
	}
	return toTaraProjectOutput(p), nil
}

func (h *TaraProject) Update(ctx context.Context, in *UpdateTaraProjectInput) (*TaraProjectOutput, error) {
	id, err := parseUUID(in.ID)
	if err != nil {
		return nil, err
	}
	p, err := h.store.UpdateTaraProject(ctx, db.UpdateTaraProjectParams{
		ID:          id,
		Name:        in.Body.Name,
		Description: in.Body.Description,
	})
	if err != nil {
		return nil, mapTaraProjectError(err)
	}
	return toTaraProjectOutput(p), nil
}

func (h *TaraProject) Delete(ctx context.Context, in *TaraProjectIDInput) (*struct{}, error) {
	id, err := parseUUID(in.ID)
	if err != nil {
		return nil, err
	}
	n, err := h.store.DeleteTaraProject(ctx, id)
	if err != nil {
		return nil, mapTaraProjectError(err)
	}
	if n == 0 {
		return nil, huma.Error404NotFound("project not found")
	}
	return nil, nil
}

func parseUUID(s string) (pgtype.UUID, error) {
	var id pgtype.UUID
	if err := id.Scan(s); err != nil {
		return id, huma.Error422UnprocessableEntity("invalid id")
	}
	return id, nil
}

func mapTaraProjectError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("project not found")
	}
	return err
}

func toTaraProjectBody(p db.TaraProject) TaraProjectBody {
	return TaraProjectBody{
		ID:          p.ID.String(),
		Name:        p.Name,
		Description: p.Description,
		CreatedAt:   p.CreatedAt.Time,
	}
}

func toTaraProjectOutput(p db.TaraProject) *TaraProjectOutput {
	return &TaraProjectOutput{Body: toTaraProjectBody(p)}
}
