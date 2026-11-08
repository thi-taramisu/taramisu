package handlers

// Project authorization. The rules are specified in docs/internal/architecture/iam/project-roles.md.
//
// Every handler below a project calls requireProject before it reads or writes data:
//
//	role, err := requireProject(ctx, h.store, projectID, PermEdit)
//	if err != nil {
//		return nil, err // already the right HTTP error: 401, 403, or 404
//	}

import (
	"context"
	"errors"

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

// ProjectAccessStore reads the caller's role; it is implemented by the sqlc-generated queries.
type ProjectAccessStore interface {
	GetProjectRole(context.Context, db.GetProjectRoleParams) (db.ProjectRole, error)
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
