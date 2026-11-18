package handlers

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// Directory looks up Authentik users and groups. The database stores only their IDs, so names and
// email addresses are read from Authentik at runtime. It is implemented by *auth.DirectoryResolver.
type Directory interface {
	ResolveUser(ctx context.Context, subject string) (auth.UserMetadata, error)
	FindActiveUserByEmail(ctx context.Context, email string) (auth.UserMetadata, error)
	ResolveGroup(ctx context.Context, groupID string) (auth.GroupMetadata, error)
	ListAssignableGroups(ctx context.Context) ([]auth.GroupMetadata, error)
}

// opRemoveProjectMember is also logged when the handler itself denies the request.
const opRemoveProjectMember = "remove-project-member"

// ProjectMemberStore is implemented by the sqlc-generated queries.
type ProjectMemberStore interface {
	UpsertIAMUser(context.Context, string) (string, error)
	UpsertIAMGroup(context.Context, string) (pgtype.UUID, error)
	ListProjectMembers(context.Context, pgtype.UUID) ([]db.ListProjectMembersRow, error)
	GetProjectMember(context.Context, db.GetProjectMemberParams) (db.GetProjectMemberRow, error)
	CreateUserMember(context.Context, db.CreateUserMemberParams) (pgtype.UUID, error)
	CreateGroupMember(context.Context, db.CreateGroupMemberParams) (pgtype.UUID, error)
	UpdateProjectMemberRole(context.Context, db.UpdateProjectMemberRoleParams) (db.UpdateProjectMemberRoleRow, error)
	DeleteProjectMember(context.Context, db.DeleteProjectMemberParams) (db.DeleteProjectMemberRow, error)
}

// ProjectMembers manages project role assignments for users and Authentik groups.
type ProjectMembers struct {
	store     ProjectMemberStore
	access    ProjectAccessStore
	directory Directory
}

// NewProjectMembers creates the handler. directory may be nil; member names are then omitted and
// adding members or listing groups returns 503.
func NewProjectMembers(store ProjectMemberStore, access ProjectAccessStore, directory Directory) *ProjectMembers {
	return &ProjectMembers{store: store, access: access, directory: directory}
}

func (h *ProjectMembers) Register(api huma.API) {
	const collection = "/api/v1/projects/{id}/members"
	const member = collection + "/{member_id}"
	api.OpenAPI().Tags = append(api.OpenAPI().Tags, &huma.Tag{
		Name: "Project members", Description: "Give users and Authentik groups a role in a project.",
	})
	op := func(id, method, path, summary, description string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary, Description: description,
			Tags: []string{"Project members"}, Security: []map[string][]string{{"bearer": {}}}}
	}
	project := func(permission Permission) Access { return InProject(h.access, ScopeProject("id"), permission) }
	Register(api, op("list-project-members", http.MethodGet, collection, "List project members",
		"Any project role. Names and email addresses are omitted when Authentik is unavailable."), project(PermRead), h.List)
	create := op("add-project-member", http.MethodPost, collection, "Add a project member",
		"Owner only. Send either the email of an active Authentik user or the ID of an assignable Authentik group. "+
			"Returns 409 if several active users share the email.")
	create.DefaultStatus = http.StatusCreated
	Register(api, create, project(PermManage), h.Create)
	Register(api, op("update-project-member", http.MethodPatch, member, "Change a member's role",
		"Owner only. Returns 409 if this would remove the last user Owner."), project(PermManage), h.Update)
	del := op(opRemoveProjectMember, http.MethodDelete, member, "Remove a project member",
		"Owners can remove anyone; every member can remove their own user assignment (leave). Returns 409 for the last user Owner.")
	del.DefaultStatus = http.StatusNoContent
	// Read is enough to reach the handler; it lets non-Owners remove only their own assignment.
	Register(api, del, project(PermRead), h.Delete)
	Register(api, huma.Operation{
		OperationID: "list-assignable-groups", Method: http.MethodGet, Path: "/api/v1/groups",
		Summary:     "List Authentik groups that can get a project role",
		Description: "Groups with the taramisu_assignable attribute. Returns 503 when Authentik is not configured or unavailable.",
		Tags:        []string{"Project members"}, Security: []map[string][]string{{"bearer": {}}},
	}, WithoutProject(), h.ListGroups)
}

// ProjectMember is one role assignment, either for a user or for an Authentik group.
type ProjectMember struct {
	ID   string `json:"id" format:"uuid"`
	Type string `json:"type" enum:"user,group"`
	// UserID is the internal user ID (compare with GET /api/v1/me) for user members.
	UserID *string `json:"user_id,omitempty" format:"uuid"`
	// GroupID is the Authentik group UUID for group members.
	GroupID    *string        `json:"group_id,omitempty"`
	Name       *string        `json:"name,omitempty"`
	Email      *string        `json:"email,omitempty"`
	Role       db.ProjectRole `json:"role" enum:"VIEWER,EDITOR,OWNER"`
	AssignedAt time.Time      `json:"assigned_at"`
}

type ProjectMemberOutput struct {
	Body ProjectMember
}

type CreateProjectMemberOutput struct {
	Location string `header:"Location"`
	Body     ProjectMember
}

type ProjectMemberListOutput struct {
	Body []ProjectMember
}

type ProjectMemberPath struct {
	ID       string `path:"id" format:"uuid"`
	MemberID string `path:"member_id" format:"uuid"`
}

type CreateProjectMemberInput struct {
	ID   string `path:"id" format:"uuid"`
	Body struct {
		Email   *string        `json:"email,omitempty" format:"email" doc:"Email of an active Authentik user"`
		GroupID *string        `json:"group_id,omitempty" format:"uuid" doc:"UUID of an assignable Authentik group"`
		Role    db.ProjectRole `json:"role" enum:"VIEWER,EDITOR,OWNER"`
	}
}

type UpdateProjectMemberInput struct {
	ProjectMemberPath
	Body struct {
		Role db.ProjectRole `json:"role" enum:"VIEWER,EDITOR,OWNER"`
	}
}

type AssignableGroup struct {
	GroupID string `json:"group_id"`
	Name    string `json:"name"`
}

type AssignableGroupListOutput struct {
	Body []AssignableGroup
}

func (h *ProjectMembers) List(ctx context.Context, _ *TaraProjectIDInput) (*ProjectMemberListOutput, error) {
	rows, err := h.store.ListProjectMembers(ctx, projectIDFromContext(ctx))
	if err != nil {
		return nil, err
	}
	names := h.newNameResolver()
	out := &ProjectMemberListOutput{Body: make([]ProjectMember, 0, len(rows))}
	for _, row := range rows {
		out.Body = append(out.Body, names.member(ctx, db.GetProjectMemberRow(row)))
	}
	return out, nil
}

func (h *ProjectMembers) Create(ctx context.Context, in *CreateProjectMemberInput) (*CreateProjectMemberOutput, error) {
	projectID := projectIDFromContext(ctx)
	body := in.Body
	if (body.Email == nil) == (body.GroupID == nil) {
		return nil, huma.Error422UnprocessableEntity("send either email or group_id")
	}
	if h.directory == nil {
		return nil, huma.Error503ServiceUnavailable("the Authentik directory is not configured")
	}
	var memberID pgtype.UUID
	var err error
	if body.Email != nil {
		memberID, err = h.addUser(ctx, projectID, *body.Email, body.Role)
	} else {
		memberID, err = h.addGroup(ctx, projectID, *body.GroupID, body.Role)
	}
	if err != nil {
		return nil, err
	}
	member, err := h.get(ctx, projectID, memberID)
	if err != nil {
		return nil, err
	}
	audit(ctx, "member.added", memberAttrs(projectID, member, "role", member.Role)...)
	return &CreateProjectMemberOutput{
		Location: "/api/v1/projects/" + projectID.String() + "/members/" + member.ID,
		Body:     member,
	}, nil
}

func (h *ProjectMembers) addUser(ctx context.Context, projectID pgtype.UUID, email string, role db.ProjectRole) (pgtype.UUID, error) {
	user, err := h.directory.FindActiveUserByEmail(ctx, email)
	if errors.Is(err, auth.ErrPrincipalNotFound) {
		return pgtype.UUID{}, huma.Error422UnprocessableEntity("no active user with this email address")
	}
	if errors.Is(err, auth.ErrAmbiguousEmail) {
		return pgtype.UUID{}, huma.Error409Conflict("several active users share this email address; an administrator must fix this in Authentik")
	}
	if err != nil {
		slog.ErrorContext(ctx, "find Authentik user", "error", err)
		return pgtype.UUID{}, huma.Error503ServiceUnavailable("the Authentik directory is unavailable")
	}
	// Users who never signed in have no iam_user row yet; create it from their token subject.
	rawUserID, err := h.store.UpsertIAMUser(ctx, user.Subject)
	if err != nil {
		return pgtype.UUID{}, err
	}
	userID, err := parseUUID(rawUserID)
	if err != nil {
		return pgtype.UUID{}, err
	}
	id, err := h.store.CreateUserMember(ctx, db.CreateUserMemberParams{ProjectID: projectID, UserID: userID, Role: role})
	return id, mapMemberError(err)
}

func (h *ProjectMembers) addGroup(ctx context.Context, projectID pgtype.UUID, groupID string, role db.ProjectRole) (pgtype.UUID, error) {
	group, err := h.directory.ResolveGroup(ctx, groupID)
	if errors.Is(err, auth.ErrPrincipalNotFound) || (err == nil && !group.Assignable) {
		return pgtype.UUID{}, huma.Error422UnprocessableEntity("this group cannot be given a project role")
	}
	if err != nil {
		slog.ErrorContext(ctx, "resolve Authentik group", "error", err)
		return pgtype.UUID{}, huma.Error503ServiceUnavailable("the Authentik directory is unavailable")
	}
	internalID, err := h.store.UpsertIAMGroup(ctx, group.GroupID)
	if err != nil {
		return pgtype.UUID{}, err
	}
	id, err := h.store.CreateGroupMember(ctx, db.CreateGroupMemberParams{ProjectID: projectID, GroupID: internalID, Role: role})
	return id, mapMemberError(err)
}

func (h *ProjectMembers) Update(ctx context.Context, in *UpdateProjectMemberInput) (*ProjectMemberOutput, error) {
	projectID := projectIDFromContext(ctx)
	memberID, err := parseUUID(in.MemberID)
	if err != nil {
		return nil, err
	}
	updated, err := h.store.UpdateProjectMemberRole(ctx, db.UpdateProjectMemberRoleParams{ProjectID: projectID, ID: memberID, Role: in.Body.Role})
	if errors.Is(err, pgx.ErrNoRows) {
		// No row is updated if the member does not exist or is the last user Owner.
		if _, getErr := h.get(ctx, projectID, memberID); getErr != nil {
			return nil, getErr
		}
		return nil, errLastOwner()
	}
	if err != nil {
		return nil, err
	}
	member, err := h.get(ctx, projectID, memberID)
	if err != nil {
		return nil, err
	}
	audit(ctx, "member.role_changed", memberAttrs(projectID, member, "before", updated.PreviousRole, "after", member.Role)...)
	return &ProjectMemberOutput{Body: member}, nil
}

func (h *ProjectMembers) Delete(ctx context.Context, in *ProjectMemberPath) (*struct{}, error) {
	projectID := projectIDFromContext(ctx)
	memberID, err := parseUUID(in.MemberID)
	if err != nil {
		return nil, err
	}
	row, err := h.store.GetProjectMember(ctx, db.GetProjectMemberParams{ProjectID: projectID, ID: memberID})
	if err != nil {
		return nil, mapMemberError(err)
	}
	self, err := callerID(ctx)
	if err != nil {
		return nil, err
	}
	// Owners may remove anyone; other members may only remove their own user assignment.
	if !Allows(RoleFromContext(ctx), PermManage) && row.UserID != self {
		err := huma.Error403Forbidden("only Owners can remove other members")
		logDenied(ctx, opRemoveProjectMember, err)
		return nil, err
	}
	removed, err := h.store.DeleteProjectMember(ctx, db.DeleteProjectMemberParams{ProjectID: projectID, ID: memberID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errLastOwner()
	}
	if err != nil {
		return nil, err
	}
	member := memberIdentity(row)
	audit(ctx, "member.removed", memberAttrs(projectID, member, "before", removed.ProjectRole, "self", row.UserID == self)...)
	return nil, nil
}

func (h *ProjectMembers) ListGroups(ctx context.Context, _ *struct{}) (*AssignableGroupListOutput, error) {
	if h.directory == nil {
		return nil, huma.Error503ServiceUnavailable("the Authentik directory is not configured")
	}
	groups, err := h.directory.ListAssignableGroups(ctx)
	if err != nil {
		slog.ErrorContext(ctx, "list Authentik groups", "error", err)
		return nil, huma.Error503ServiceUnavailable("the Authentik directory is unavailable")
	}
	out := &AssignableGroupListOutput{Body: make([]AssignableGroup, 0, len(groups))}
	for _, g := range groups {
		out.Body = append(out.Body, AssignableGroup{GroupID: g.GroupID, Name: g.Name})
	}
	return out, nil
}

func (h *ProjectMembers) get(ctx context.Context, projectID, memberID pgtype.UUID) (ProjectMember, error) {
	row, err := h.store.GetProjectMember(ctx, db.GetProjectMemberParams{ProjectID: projectID, ID: memberID})
	if err != nil {
		return ProjectMember{}, mapMemberError(err)
	}
	return h.newNameResolver().member(ctx, row), nil
}

func errLastOwner() error {
	return huma.Error409Conflict("a project needs at least one user with the Owner role")
}

func mapMemberError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("member not found")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
		return huma.Error409Conflict("this user or group already has a role in the project")
	}
	return err
}

// nameResolver adds Authentik display names to members. After the first directory outage it
// stops asking, so one unavailable Authentik does not slow down every row of a list.
type nameResolver struct {
	directory Directory
	down      bool
}

func (h *ProjectMembers) newNameResolver() *nameResolver {
	return &nameResolver{directory: h.directory, down: h.directory == nil}
}

// memberIdentity converts a row without display names.
func memberIdentity(row db.GetProjectMemberRow) ProjectMember {
	m := ProjectMember{ID: row.ID.String(), Role: row.ProjectRole, AssignedAt: row.AssignedAt.Time, Type: "group",
		GroupID: row.ExternalIamGroupID}
	if row.UserID.Valid {
		userID := row.UserID.String()
		m.Type, m.UserID, m.GroupID = "user", &userID, nil
	}
	return m
}

func (n *nameResolver) member(ctx context.Context, row db.GetProjectMemberRow) ProjectMember {
	m := memberIdentity(row)
	switch {
	case row.UserID.Valid:
		if row.ExternalIamSub != nil && !n.down {
			user, err := n.directory.ResolveUser(ctx, *row.ExternalIamSub)
			n.note(ctx, err)
			if err == nil {
				m.Name, m.Email = nonEmpty(user.Name), nonEmpty(user.Email)
			}
		}
	default:
		if row.ExternalIamGroupID != nil && !n.down {
			group, err := n.directory.ResolveGroup(ctx, *row.ExternalIamGroupID)
			n.note(ctx, err)
			if err == nil {
				m.Name = nonEmpty(group.Name)
			}
		}
	}
	return m
}

func (n *nameResolver) note(ctx context.Context, err error) {
	if err != nil && !errors.Is(err, auth.ErrPrincipalNotFound) {
		slog.WarnContext(ctx, "resolve member display name", "error", err)
		n.down = true
	}
}

func nonEmpty(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return &s
}
