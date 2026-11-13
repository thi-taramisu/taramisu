package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type TaraProjectStore interface {
	CreateTaraProject(context.Context, db.CreateTaraProjectParams) (db.CreateTaraProjectRow, error)
	GetTaraProject(context.Context, pgtype.UUID) (db.TaraProject, error)
	ListTaraProjects(context.Context, db.ListTaraProjectsParams) ([]db.ListTaraProjectsRow, error)
	ReplaceTaraProject(context.Context, db.ReplaceTaraProjectParams) (db.TaraProject, error)
	UpdateTaraProject(context.Context, db.UpdateTaraProjectParams) (db.TaraProject, error)
	// DeleteTaraProject also records the audit event (see db.Store).
	DeleteTaraProject(context.Context, db.Actor, pgtype.UUID) error
}

type TaraProject struct {
	store  TaraProjectStore
	access ProjectAccessStore
}

func NewTaraProject(store TaraProjectStore, access ProjectAccessStore) *TaraProject {
	return &TaraProject{store: store, access: access}
}

func (h *TaraProject) Register(api huma.API) {
	const collection = "/api/v1/projects"
	const member = collection + "/{id}"
	api.OpenAPI().Tags = append(api.OpenAPI().Tags, &huma.Tag{
		Name: "Tara Project", Description: "Create, read, replace, update and delete TARA projects.",
	})
	op := func(id, method, path, summary string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Tara Project"}, Security: []map[string][]string{{"bearer": {}}}}
	}
	project := func(permission Permission) Access { return InProject(h.access, ScopeProject("id"), permission) }
	Register(api, op("list-tara-projects", http.MethodGet, collection, "List TARA projects"), WithoutProject(), h.List)
	create := op("create-tara-project", http.MethodPost, collection, "Create a TARA project")
	create.DefaultStatus = http.StatusCreated
	Register(api, create, WithoutProject(), h.Create)
	Register(api, op("get-tara-project", http.MethodGet, member, "Get a TARA project"), project(PermRead), h.Get)
	Register(api, op("replace-tara-project", http.MethodPut, member, "Replace a TARA project"), project(PermManage), h.Replace)
	Register(api, op("update-tara-project", http.MethodPatch, member, "Partially update a TARA project"), project(PermManage), h.Update)
	del := op("delete-tara-project", http.MethodDelete, member, "Delete a TARA project")
	del.DefaultStatus = http.StatusNoContent
	Register(api, del, project(PermManage), h.Delete)
}

type TaraProjectBody struct {
	ID          string    `json:"id" format:"uuid"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	// Role is the caller's highest role in the project.
	Role db.ProjectRole `json:"role" enum:"VIEWER,EDITOR,OWNER"`
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
		Name        string  `json:"name" minLength:"1" pattern:"\\S"`
		Description *string `json:"description,omitempty"`
	}
}

type ReplaceTaraProjectInput struct {
	ID   string `path:"id" format:"uuid"`
	Body struct {
		Name        string  `json:"name" minLength:"1" pattern:"\\S"`
		Description *string `json:"description,omitempty"`
	}
}

type UpdateTaraProjectInput struct {
	ID   string `path:"id" format:"uuid"`
	Body struct {
		Name        *string          `json:"name,omitempty" minLength:"1" pattern:"\\S"`
		Description Optional[string] `json:"description,omitempty"`
	}
}

// Create stores the project and makes the caller its first Owner. Every active user may create projects.
func (h *TaraProject) Create(ctx context.Context, in *CreateTaraProjectInput) (*TaraProjectOutput, error) {
	ownerID, err := callerID(ctx)
	if err != nil {
		return nil, err
	}
	p, err := h.store.CreateTaraProject(ctx, db.CreateTaraProjectParams{
		Name:        in.Body.Name,
		Description: in.Body.Description,
		OwnerID:     ownerID,
	})
	if err != nil {
		return nil, err
	}
	return toTaraProjectOutput(db.TaraProject(p), db.ProjectRoleOWNER), nil
}

// List returns only projects the caller has a role in.
func (h *TaraProject) List(ctx context.Context, _ *struct{}) (*TaraProjectListOutput, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return nil, err
	}
	projects, err := h.store.ListTaraProjects(ctx, db.ListTaraProjectsParams{UserID: userID, GroupIds: callerGroups(ctx)})
	if err != nil {
		return nil, err
	}
	out := &TaraProjectListOutput{Body: make([]TaraProjectBody, 0, len(projects))}
	for _, p := range projects {
		out.Body = append(out.Body, toTaraProjectBody(db.TaraProject{
			ID: p.ID, Name: p.Name, Description: p.Description, CreatedAt: p.CreatedAt,
		}, p.Role))
	}
	return out, nil
}

func (h *TaraProject) Get(ctx context.Context, _ *TaraProjectIDInput) (*TaraProjectOutput, error) {
	p, err := h.store.GetTaraProject(ctx, projectIDFromContext(ctx))
	if err != nil {
		return nil, mapTaraProjectError(err)
	}
	return toTaraProjectOutput(p, RoleFromContext(ctx)), nil
}

func (h *TaraProject) Replace(ctx context.Context, in *ReplaceTaraProjectInput) (*TaraProjectOutput, error) {
	p, err := h.store.ReplaceTaraProject(ctx, db.ReplaceTaraProjectParams{
		ID:          projectIDFromContext(ctx),
		Name:        in.Body.Name,
		Description: in.Body.Description,
	})
	if err != nil {
		return nil, mapTaraProjectError(err)
	}
	return toTaraProjectOutput(p, RoleFromContext(ctx)), nil
}

func (h *TaraProject) Update(ctx context.Context, in *UpdateTaraProjectInput) (*TaraProjectOutput, error) {
	p, err := h.store.UpdateTaraProject(ctx, db.UpdateTaraProjectParams{
		ID:             projectIDFromContext(ctx),
		Name:           in.Body.Name,
		SetDescription: in.Body.Description.Set,
		Description:    in.Body.Description.Value,
	})
	if err != nil {
		return nil, mapTaraProjectError(err)
	}
	return toTaraProjectOutput(p, RoleFromContext(ctx)), nil
}

func (h *TaraProject) Delete(ctx context.Context, _ *TaraProjectIDInput) (*struct{}, error) {
	id := projectIDFromContext(ctx)
	actor, err := auditActor(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.store.DeleteTaraProject(ctx, actor, id); err != nil {
		return nil, mapTaraProjectError(err)
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
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, db.ErrProjectNotFound) {
		return huma.Error404NotFound("project not found")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" { // foreign_key_violation
		return huma.Error409Conflict("project still contains item definitions")
	}
	return err
}

func toTaraProjectBody(p db.TaraProject, role db.ProjectRole) TaraProjectBody {
	return TaraProjectBody{
		ID:          p.ID.String(),
		Name:        p.Name,
		Description: p.Description,
		CreatedAt:   p.CreatedAt.Time,
		Role:        role,
	}
}

func toTaraProjectOutput(p db.TaraProject, role db.ProjectRole) *TaraProjectOutput {
	return &TaraProjectOutput{Body: toTaraProjectBody(p, role)}
}
