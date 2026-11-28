package handlers

import (
	"context"
	"errors"
	"net/http"
	"reflect"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// TaraProjectStore is implemented by db.Store. Changes run inside Audit.
type TaraProjectStore interface {
	Auditor
	ArchiveTaraProject(context.Context, pgtype.UUID) (db.TaraProject, error)
	UnarchiveTaraProject(context.Context, pgtype.UUID) (db.TaraProject, error)
	CreateTaraProject(context.Context, db.CreateTaraProjectParams) (db.CreateTaraProjectRow, error)
	GetTaraProject(context.Context, pgtype.UUID) (db.TaraProject, error)
	GetTaraProjectForUpdate(context.Context, pgtype.UUID) (db.TaraProject, error)
	ListTaraProjects(context.Context, db.ListTaraProjectsParams) ([]db.ListTaraProjectsRow, error)
	ReplaceTaraProject(context.Context, db.ReplaceTaraProjectParams) (db.TaraProject, error)
	UpdateTaraProject(context.Context, db.UpdateTaraProjectParams) (db.TaraProject, error)
	// DeleteTaraProject marks the project as deleted and records the audit event (see db.Store).
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
	Register(api, op("archive-tara-project", http.MethodPost, member+"/archive", "Archive a TARA project (idempotent)"), project(PermManage).AllowArchived(), h.Archive)
	Register(api, op("unarchive-tara-project", http.MethodPost, member+"/unarchive", "Unarchive an archived TARA project (idempotent)"), project(PermManage).AllowArchived(), h.Unarchive)
	del := op("delete-tara-project", http.MethodDelete, member, "Delete a TARA project")
	del.DefaultStatus = http.StatusNoContent
	del.Description = "Owner only. The project disappears for all members at once, with all its content, and is deleted permanently after a grace period (30 days by default). Until then, an operator can restore it."
	Register(api, del, project(PermManage).AllowArchived(), h.Delete)
}

type TaraProjectBody struct {
	ArchivedAt  *time.Time `json:"archived_at" doc:"Archive timestamp; null for an active project"`
	ID          string     `json:"id" format:"uuid"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	// Role is the caller's highest role in the project.
	Role db.ProjectRole `json:"role" enum:"VIEWER,EDITOR,OWNER"`
}

type TaraProjectOutput struct {
	Body TaraProjectBody
}

type TaraProjectListOutput struct {
	Body []TaraProjectBody
}

type ListTaraProjectsInput struct {
	Archived OptionalBoolQuery `query:"archived" doc:"true: archived only; false: active only; omitted: both"`
}

// OptionalBoolQuery distinguishes an omitted query flag from explicit false.
type OptionalBoolQuery struct {
	Value bool
	Set   bool
}

func (o OptionalBoolQuery) Schema(r huma.Registry) *huma.Schema {
	return r.Schema(reflect.TypeFor[bool](), true, "")
}
func (o *OptionalBoolQuery) Receiver() reflect.Value    { return reflect.ValueOf(&o.Value).Elem() }
func (o *OptionalBoolQuery) OnParamSet(set bool, _ any) { o.Set = set }

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
	actor, err := auditActor(ctx)
	if err != nil {
		return nil, err
	}
	ownerID := actor.UserID
	var p db.CreateTaraProjectRow
	// Calls Audit directly instead of audit(...), because the actor is also the first Owner.
	err = h.store.Audit(ctx, actor, func(ctx context.Context) (db.Change, error) {
		var err error
		p, err = h.store.CreateTaraProject(ctx, db.CreateTaraProjectParams{
			Name:        in.Body.Name,
			Description: in.Body.Description,
			OwnerID:     ownerID,
		})
		if err != nil {
			return db.Change{}, err
		}
		return db.Created(db.TargetProject, p.ID, p.ID, projectSettings{Name: p.Name, FirstOwner: ownerID}), nil
	})
	if err != nil {
		return nil, err
	}
	return toTaraProjectOutput(db.TaraProject{ID: p.ID, Name: p.Name, Description: p.Description, CreatedAt: p.CreatedAt}, db.ProjectRoleOWNER), nil
}

// List returns only projects the caller has a role in.
func (h *TaraProject) List(ctx context.Context, in *ListTaraProjectsInput) (*TaraProjectListOutput, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return nil, err
	}
	var archived *bool
	if in.Archived.Set {
		archived = &in.Archived.Value
	}
	projects, err := h.store.ListTaraProjects(ctx, db.ListTaraProjectsParams{UserID: userID, GroupIds: callerGroups(ctx), Archived: archived})
	if err != nil {
		return nil, err
	}
	out := &TaraProjectListOutput{Body: make([]TaraProjectBody, 0, len(projects))}
	for _, p := range projects {
		out.Body = append(out.Body, toTaraProjectBody(db.TaraProject{
			ID: p.ID, Name: p.Name, Description: p.Description, CreatedAt: p.CreatedAt, ArchivedAt: p.ArchivedAt,
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
	return h.changeSettings(ctx, func(ctx context.Context, id pgtype.UUID) (db.TaraProject, error) {
		return h.store.ReplaceTaraProject(ctx, db.ReplaceTaraProjectParams{ID: id, Name: in.Body.Name, Description: in.Body.Description})
	})
}

func (h *TaraProject) Update(ctx context.Context, in *UpdateTaraProjectInput) (*TaraProjectOutput, error) {
	return h.changeSettings(ctx, func(ctx context.Context, id pgtype.UUID) (db.TaraProject, error) {
		return h.store.UpdateTaraProject(ctx, db.UpdateTaraProjectParams{
			ID:             id,
			Name:           in.Body.Name,
			SetDescription: in.Body.Description.Set,
			Description:    in.Body.Description.Value,
		})
	})
}

// changeSettings runs update and records project.updated, unless nothing changed.
func (h *TaraProject) changeSettings(ctx context.Context, update func(context.Context, pgtype.UUID) (db.TaraProject, error)) (*TaraProjectOutput, error) {
	id := projectIDFromContext(ctx)
	var p db.TaraProject
	err := audit(ctx, h.store, func(ctx context.Context) (db.Change, error) {
		before, err := h.store.GetTaraProjectForUpdate(ctx, id)
		if err != nil {
			return db.Change{}, err
		}
		if p, err = update(ctx, id); err != nil {
			return db.Change{}, err
		}
		after := projectSettings{Name: p.Name, DescriptionChanged: !sameText(before.Description, p.Description)}
		return db.Updated(db.TargetProject, id, id, projectSettings{Name: before.Name}, after), nil
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
	return err
}

func toTaraProjectBody(p db.TaraProject, role db.ProjectRole) TaraProjectBody {
	var archivedAt *time.Time
	if p.ArchivedAt.Valid {
		archivedAt = &p.ArchivedAt.Time
	}
	return TaraProjectBody{
		ArchivedAt:  archivedAt,
		ID:          p.ID.String(),
		Name:        p.Name,
		Description: p.Description,
		CreatedAt:   p.CreatedAt.Time,
		Role:        role,
	}
}

func (h *TaraProject) Archive(ctx context.Context, _ *TaraProjectIDInput) (*TaraProjectOutput, error) {
	return h.changeArchiveState(ctx, "project.archived", h.store.ArchiveTaraProject)
}

func (h *TaraProject) Unarchive(ctx context.Context, _ *TaraProjectIDInput) (*TaraProjectOutput, error) {
	return h.changeArchiveState(ctx, "project.unarchived", h.store.UnarchiveTaraProject)
}

func (h *TaraProject) changeArchiveState(ctx context.Context, event string, update func(context.Context, pgtype.UUID) (db.TaraProject, error)) (*TaraProjectOutput, error) {
	id := projectIDFromContext(ctx)
	var p db.TaraProject
	err := audit(ctx, h.store, func(ctx context.Context) (db.Change, error) {
		before, err := h.store.GetTaraProjectForUpdate(ctx, id)
		if err != nil {
			return db.Change{}, err
		}
		if p, err = update(ctx, id); err != nil || before.ArchivedAt.Valid == p.ArchivedAt.Valid {
			return db.Change{}, err
		}
		return db.Change{
			Event: event, ProjectID: id, TargetType: db.TargetProject, TargetID: id,
			Before: map[string]bool{"archived": before.ArchivedAt.Valid},
			After:  map[string]bool{"archived": p.ArchivedAt.Valid},
		}, nil
	})
	if err != nil {
		return nil, mapTaraProjectError(err)
	}
	return toTaraProjectOutput(p, RoleFromContext(ctx)), nil
}

func toTaraProjectOutput(p db.TaraProject, role db.ProjectRole) *TaraProjectOutput {
	return &TaraProjectOutput{Body: toTaraProjectBody(p, role)}
}

// sameText reports whether two optional texts are equal; nil equals only nil.
func sameText(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}
