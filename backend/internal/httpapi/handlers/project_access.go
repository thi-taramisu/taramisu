package handlers

// Project authorization. The rules are specified in docs/internal/architecture/iam/project-roles.md.
//
// Access is denied by default. Every operation under /api/ is registered with Register and
// declares either the permission it needs in a project or that it has no project:
//
//	Register(api, op, InProject(h.store, ScopeItemDefinition, PermEdit), h.Update)
//	Register(api, op, WithoutProject(), h.List)
//
// The check runs before the handler. CheckAccessDeclared makes the API refuse to start if an
// operation was registered without a declaration.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// Permission names what a handler does, not who may do it.
type Permission int

const (
	// PermRead covers all GET requests, export, the member list, and leaving a project.
	PermRead Permission = iota
	// PermEdit covers creating, changing, and deleting analysis content.
	PermEdit
	// PermManage covers project settings, members, archive, and delete.
	PermManage
)

// String is the permission's name in the OpenAPI document (x-taramisu-permission).
func (p Permission) String() string {
	switch p {
	case PermRead:
		return "read"
	case PermEdit:
		return "edit"
	default:
		return "manage"
	}
}

// minimumRole is the only place that maps permissions to roles.
var minimumRole = map[Permission]db.ProjectRole{
	PermRead:   db.ProjectRoleVIEWER,
	PermEdit:   db.ProjectRoleEDITOR,
	PermManage: db.ProjectRoleOWNER,
}

// roleRank orders roles so that a higher role includes the permissions of the lower ones.
var roleRank = map[db.ProjectRole]int{
	db.ProjectRoleVIEWER: 1,
	db.ProjectRoleEDITOR: 2,
	db.ProjectRoleOWNER:  3,
}

// Allows reports whether role grants permission.
func Allows(role db.ProjectRole, permission Permission) bool {
	return roleRank[role] >= roleRank[minimumRole[permission]]
}

// ProjectAccessStore reads the caller's role and finds the project of a record. It is
// implemented by the sqlc-generated queries.
type ProjectAccessStore interface {
	GetProjectRole(context.Context, db.GetProjectRoleParams) (db.ProjectRole, error)
	ProjectIDForItemDefinition(context.Context, pgtype.UUID) (pgtype.UUID, error)
	ProjectIDForThreatScenario(context.Context, pgtype.UUID) (pgtype.UUID, error)
}

// Scope says which path parameter leads to the project.
type Scope struct {
	param  string
	lookup func(context.Context, ProjectAccessStore, pgtype.UUID) (pgtype.UUID, error)
}

// ScopeProject is for operations whose path parameter is the project ID itself, such as {id} below /projects.
func ScopeProject(param string) Scope { return Scope{param: param} }

var (
	// ScopeItemDefinition is for operations below /item-definitions/{item_definition_id}.
	ScopeItemDefinition = Scope{param: "item_definition_id", lookup: func(ctx context.Context, s ProjectAccessStore, id pgtype.UUID) (pgtype.UUID, error) {
		return s.ProjectIDForItemDefinition(ctx, id)
	}}
	// ScopeThreatScenario is for operations below /threat-scenarios/{threat_scenario_id}.
	ScopeThreatScenario = Scope{param: "threat_scenario_id", lookup: func(ctx context.Context, s ProjectAccessStore, id pgtype.UUID) (pgtype.UUID, error) {
		return s.ProjectIDForThreatScenario(ctx, id)
	}}
)

// Access is an operation's access declaration, created with InProject or WithoutProject.
type Access struct {
	store      ProjectAccessStore
	scope      Scope
	permission Permission
	inProject  bool
}

// InProject declares that the operation needs permission in the project that scope leads to.
func InProject(store ProjectAccessStore, scope Scope, permission Permission) Access {
	return Access{store: store, scope: scope, permission: permission, inProject: true}
}

// WithoutProject declares that the operation belongs to no project, for example the project list.
// Authentication still applies to every /api/ route.
func WithoutProject() Access { return Access{} }

// accessMetadataKey marks registered operations in huma.Operation.Metadata.
const accessMetadataKey = "taramisu.access"

// Register registers op with its access declaration. For InProject, the caller's role is checked
// before the handler runs; the handler can read it with RoleFromContext.
func Register[I, O any](api huma.API, op huma.Operation, access Access, handler func(context.Context, *I) (*O, error)) {
	if op.Metadata == nil {
		op.Metadata = map[string]any{}
	}
	op.Metadata[accessMetadataKey] = access
	if access.inProject {
		if !strings.Contains(op.Path, "{"+access.scope.param+"}") {
			panic(fmt.Sprintf("%s %s: path has no {%s} parameter for its access scope", op.Method, op.Path, access.scope.param))
		}
		if op.Extensions == nil {
			op.Extensions = map[string]any{}
		}
		op.Extensions["x-taramisu-permission"] = access.permission.String()
		op.Errors = appendMissing(op.Errors, http.StatusForbidden, http.StatusNotFound)
		op.Middlewares = append(op.Middlewares, access.middleware(api))
	}
	huma.Register(api, op, handler)
}

func appendMissing(codes []int, add ...int) []int {
	for _, code := range add {
		found := false
		for _, c := range codes {
			found = found || c == code
		}
		if !found {
			codes = append(codes, code)
		}
	}
	return codes
}

// projectAccess is what the check stores in the request context.
type projectAccess struct {
	projectID pgtype.UUID
	role      db.ProjectRole
}

type projectAccessKey struct{}

func (a Access) middleware(api huma.API) func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		access, err := a.check(ctx.Context(), ctx.Param(a.scope.param))
		if err != nil {
			writeAccessError(api, ctx, err)
			return
		}
		next(huma.WithValue(ctx, projectAccessKey{}, access))
	}
}

func (a Access) check(ctx context.Context, rawID string) (projectAccess, error) {
	id, err := parseUUID(rawID)
	if err != nil {
		return projectAccess{}, err
	}
	projectID := id
	if a.scope.lookup != nil {
		if projectID, err = projectOf(a.scope.lookup(ctx, a.store, id)); err != nil {
			return projectAccess{}, err
		}
	}
	role, err := requireProject(ctx, a.store, projectID, a.permission)
	if err != nil {
		return projectAccess{}, err
	}
	return projectAccess{projectID: projectID, role: role}, nil
}

func writeAccessError(api huma.API, ctx huma.Context, err error) {
	var statusErr huma.StatusError
	if errors.As(err, &statusErr) {
		_ = huma.WriteErr(api, ctx, statusErr.GetStatus(), statusErr.Error())
		return
	}
	slog.Error("check project access", "error", err)
	_ = huma.WriteErr(api, ctx, http.StatusInternalServerError, "internal server error")
}

// RoleFromContext returns the caller's role in the operation's project, set by the access check.
func RoleFromContext(ctx context.Context) db.ProjectRole {
	access, _ := ctx.Value(projectAccessKey{}).(projectAccess)
	return access.role
}

// projectIDFromContext returns the project ID that the access check resolved.
func projectIDFromContext(ctx context.Context) pgtype.UUID {
	access, _ := ctx.Value(projectAccessKey{}).(projectAccess)
	return access.projectID
}

// CheckAccessDeclared returns an error naming every /api/ operation registered without Register.
func CheckAccessDeclared(spec *huma.OpenAPI) error {
	var missing []string
	for path, item := range spec.Paths {
		if !strings.HasPrefix(path, "/api/") {
			continue
		}
		for method, op := range map[string]*huma.Operation{
			http.MethodGet: item.Get, http.MethodPost: item.Post, http.MethodPut: item.Put,
			http.MethodPatch: item.Patch, http.MethodDelete: item.Delete,
		} {
			if op == nil {
				continue
			}
			if _, ok := op.Metadata[accessMetadataKey].(Access); !ok {
				missing = append(missing, method+" "+path)
			}
		}
	}
	if len(missing) == 0 {
		return nil
	}
	sort.Strings(missing)
	return fmt.Errorf("operations without an access declaration (use handlers.Register): %s", strings.Join(missing, ", "))
}

// callerID returns the authenticated user's internal iam_user.id from the request context.
// The authentication middleware has already verified the token; an unusable ID means no valid login.
func callerID(ctx context.Context) (pgtype.UUID, error) {
	var id pgtype.UUID
	if err := id.Scan(auth.UserFromContext(ctx).ID); err != nil || !id.Valid {
		return id, huma.Error401Unauthorized("authentication required")
	}
	return id, nil
}

// callerGroups returns the caller's assignable Authentik groups from the token claim
// taramisu_groups. It returns an empty list instead of nil, so the role queries always get an
// array rather than NULL.
func callerGroups(ctx context.Context) []string {
	if groups := auth.UserFromContext(ctx).Groups; groups != nil {
		return groups
	}
	return []string{}
}

// requireProject returns the caller's highest role in the project if it grants permission.
// Callers without any role get 404, so the response does not reveal whether the project exists.
// Members whose role is too low get 403.
func requireProject(ctx context.Context, store ProjectAccessStore, projectID pgtype.UUID, permission Permission) (db.ProjectRole, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	role, err := store.GetProjectRole(ctx, db.GetProjectRoleParams{ProjectID: projectID, UserID: userID, GroupIds: callerGroups(ctx)})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", huma.Error404NotFound("project not found")
	}
	if err != nil {
		return "", err
	}
	if !Allows(role, permission) {
		return role, huma.Error403Forbidden("your project role does not allow this action")
	}
	return role, nil
}

// projectOf wraps a parent lookup such as ProjectIDForItemDefinition. An unknown parent is
// reported as 404, like a project the caller cannot see:
//
//	projectID, err := projectOf(h.store.ProjectIDForItemDefinition(ctx, itemID))
func projectOf(projectID pgtype.UUID, err error) (pgtype.UUID, error) {
	if errors.Is(err, pgx.ErrNoRows) {
		return projectID, huma.Error404NotFound("project not found")
	}
	return projectID, err
}
