package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const (
	ownerMemberID = "aaaaaaaa-0000-4000-8000-000000000001"
	otherMemberID = "aaaaaaaa-0000-4000-8000-000000000002"
	groupMemberID = "aaaaaaaa-0000-4000-8000-000000000003"
	otherUserID   = "bbbbbbbb-0000-4000-8000-000000000002"
	newUserID     = "bbbbbbbb-0000-4000-8000-000000000009"
	teamGroupID   = "cccccccc-0000-4000-8000-000000000001"
	newMemberID   = "aaaaaaaa-0000-4000-8000-000000000009"
)

func mustUUID(s string) pgtype.UUID {
	var id pgtype.UUID
	if err := id.Scan(s); err != nil {
		panic(err)
	}
	return id
}

// fakeMembers keeps role assignments in memory and applies the same last-Owner rule as the SQL.
type fakeMembers struct {
	healthQueries
	callerRole db.ProjectRole
	members    []db.GetProjectMemberRow
	upserted   string
	createErr  error
}

func newFakeMembers(callerRole db.ProjectRole) *fakeMembers {
	sub, otherSub, group := authtest.Subject, "other-sub", teamGroupID
	at := pgtype.Timestamptz{Time: time.Unix(0, 0).UTC(), Valid: true}
	return &fakeMembers{
		callerRole: callerRole,
		members: []db.GetProjectMemberRow{
			{ID: mustUUID(ownerMemberID), ProjectRole: callerRole, AssignedAt: at, UserID: mustUUID(authtest.UserID), ExternalIamSub: &sub},
			{ID: mustUUID(otherMemberID), ProjectRole: db.ProjectRoleOWNER, AssignedAt: at, UserID: mustUUID(otherUserID), ExternalIamSub: &otherSub},
			{ID: mustUUID(groupMemberID), ProjectRole: db.ProjectRoleEDITOR, AssignedAt: at, ExternalIamGroupID: &group},
		},
	}
}

func (f *fakeMembers) GetProjectRole(context.Context, db.GetProjectRoleParams) (db.ProjectRole, error) {
	if f.callerRole == "" {
		return "", pgx.ErrNoRows
	}
	return f.callerRole, nil
}

func (f *fakeMembers) UpsertIAMUser(_ context.Context, sub string) (string, error) {
	f.upserted = sub
	return newUserID, nil
}

func (f *fakeMembers) UpsertIAMGroup(context.Context, string) (pgtype.UUID, error) {
	return mustUUID(teamGroupID), nil
}

func (f *fakeMembers) ListProjectMembers(context.Context, pgtype.UUID) ([]db.ListProjectMembersRow, error) {
	out := make([]db.ListProjectMembersRow, 0, len(f.members))
	for _, m := range f.members {
		out = append(out, db.ListProjectMembersRow(m))
	}
	return out, nil
}

func (f *fakeMembers) find(id pgtype.UUID) int {
	for i, m := range f.members {
		if m.ID == id {
			return i
		}
	}
	return -1
}

func (f *fakeMembers) GetProjectMember(_ context.Context, a db.GetProjectMemberParams) (db.GetProjectMemberRow, error) {
	if i := f.find(a.ID); i >= 0 {
		return f.members[i], nil
	}
	return db.GetProjectMemberRow{}, pgx.ErrNoRows
}

func (f *fakeMembers) add(row db.GetProjectMemberRow) (pgtype.UUID, error) {
	if f.createErr != nil {
		return pgtype.UUID{}, f.createErr
	}
	row.ID = mustUUID(newMemberID)
	f.members = append(f.members, row)
	return row.ID, nil
}

func (f *fakeMembers) CreateUserMember(_ context.Context, a db.CreateUserMemberParams) (pgtype.UUID, error) {
	sub := f.upserted
	return f.add(db.GetProjectMemberRow{ProjectRole: a.Role, UserID: a.UserID, ExternalIamSub: &sub})
}

func (f *fakeMembers) CreateGroupMember(_ context.Context, a db.CreateGroupMemberParams) (pgtype.UUID, error) {
	group := teamGroupID
	return f.add(db.GetProjectMemberRow{ProjectRole: a.Role, ExternalIamGroupID: &group})
}

// protectsLastOwner mirrors the SQL guard: the last user Owner cannot lose the role.
func (f *fakeMembers) protectsLastOwner(i int) bool {
	m := f.members[i]
	if !m.UserID.Valid || m.ProjectRole != db.ProjectRoleOWNER {
		return false
	}
	for j, o := range f.members {
		if j != i && o.UserID.Valid && o.ProjectRole == db.ProjectRoleOWNER {
			return false
		}
	}
	return true
}

func (f *fakeMembers) UpdateProjectMemberRole(_ context.Context, a db.UpdateProjectMemberRoleParams) (db.UpdateProjectMemberRoleRow, error) {
	i := f.find(a.ID)
	if i < 0 || (a.Role != db.ProjectRoleOWNER && f.protectsLastOwner(i)) {
		return db.UpdateProjectMemberRoleRow{}, pgx.ErrNoRows
	}
	previous := f.members[i].ProjectRole
	f.members[i].ProjectRole = a.Role
	return db.UpdateProjectMemberRoleRow{ID: a.ID, PreviousRole: previous}, nil
}

func (f *fakeMembers) DeleteProjectMember(_ context.Context, a db.DeleteProjectMemberParams) (db.DeleteProjectMemberRow, error) {
	i := f.find(a.ID)
	if i < 0 || f.protectsLastOwner(i) {
		return db.DeleteProjectMemberRow{}, pgx.ErrNoRows
	}
	removed := f.members[i]
	f.members = append(f.members[:i], f.members[i+1:]...)
	return db.DeleteProjectMemberRow{ID: a.ID, ProjectRole: removed.ProjectRole}, nil
}

type fakeDirectory struct {
	err   error
	calls int
}

func (d *fakeDirectory) ResolveUser(_ context.Context, subject string) (auth.UserMetadata, error) {
	d.calls++
	if d.err != nil {
		return auth.UserMetadata{}, d.err
	}
	return auth.UserMetadata{Subject: subject, Name: "Name of " + subject, Email: subject + "@example.com"}, nil
}

func (d *fakeDirectory) FindActiveUserByEmail(_ context.Context, email string) (auth.UserMetadata, error) {
	if d.err != nil {
		return auth.UserMetadata{}, d.err
	}
	switch email {
	case "new@example.com":
	case "shared@example.com":
		return auth.UserMetadata{}, auth.ErrAmbiguousEmail
	default:
		return auth.UserMetadata{}, auth.ErrPrincipalNotFound
	}
	return auth.UserMetadata{Subject: "new-sub", Name: "New", Email: email}, nil
}

func (d *fakeDirectory) ResolveGroup(_ context.Context, groupID string) (auth.GroupMetadata, error) {
	if d.err != nil {
		return auth.GroupMetadata{}, d.err
	}
	switch groupID {
	case teamGroupID:
		return auth.GroupMetadata{GroupID: groupID, Name: "Team", Assignable: true}, nil
	case "dddddddd-0000-4000-8000-000000000001":
		return auth.GroupMetadata{GroupID: groupID, Name: "Admins"}, nil
	}
	return auth.GroupMetadata{}, auth.ErrPrincipalNotFound
}

func (d *fakeDirectory) ListAssignableGroups(context.Context) ([]auth.GroupMetadata, error) {
	if d.err != nil {
		return nil, d.err
	}
	return []auth.GroupMetadata{{GroupID: teamGroupID, Name: "Team", Assignable: true}}, nil
}

type memberAPI struct {
	t       *testing.T
	handler http.Handler
	bearer  string
}

func newMemberAPI(t *testing.T, store *fakeMembers, directory handlers.Directory) memberAPI {
	manager, bearer := authtest.NewManagerAndToken(t)
	var opts []httpapi.Option
	if directory != nil {
		opts = append(opts, httpapi.WithDirectory(directory))
	}
	return memberAPI{t: t, handler: httpapi.New(store, manager, opts...), bearer: bearer}
}

func (a memberAPI) call(method, path, body string) *httptest.ResponseRecorder {
	a.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", a.bearer)
	rr := httptest.NewRecorder()
	a.handler.ServeHTTP(rr, req)
	return rr
}

const membersPath = "/api/v1/projects/" + projectID + "/members"

func TestProjectMembersList(t *testing.T) {
	directory := &fakeDirectory{}
	rr := newMemberAPI(t, newFakeMembers(db.ProjectRoleVIEWER), directory).call(http.MethodGet, membersPath, "")
	var got []handlers.ProjectMember
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil || rr.Code != http.StatusOK || len(got) != 3 {
		t.Fatalf("list: %d %s", rr.Code, rr.Body.String())
	}
	if got[0].Type != "user" || got[0].UserID == nil || *got[0].UserID != authtest.UserID || got[0].Email == nil {
		t.Fatalf("user member = %+v", got[0])
	}
	if got[2].Type != "group" || got[2].GroupID == nil || *got[2].GroupID != teamGroupID || got[2].Name == nil || *got[2].Name != "Team" {
		t.Fatalf("group member = %+v", got[2])
	}

	// An unavailable directory is asked once; the list is still returned without names.
	down := &fakeDirectory{err: errors.New("authentik down")}
	rr = newMemberAPI(t, newFakeMembers(db.ProjectRoleVIEWER), down).call(http.MethodGet, membersPath, "")
	got = nil
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil || rr.Code != http.StatusOK || got[0].Name != nil || down.calls != 1 {
		t.Fatalf("list without directory: %d calls=%d %s", rr.Code, down.calls, rr.Body.String())
	}

	if rr := newMemberAPI(t, newFakeMembers(""), directory).call(http.MethodGet, membersPath, ""); rr.Code != http.StatusNotFound {
		t.Fatalf("non-member list: %d", rr.Code)
	}
}

func TestProjectMembersCreate(t *testing.T) {
	for _, tc := range []struct {
		name      string
		role      db.ProjectRole
		directory *fakeDirectory
		createErr error
		body      string
		code      int
	}{
		{"user", db.ProjectRoleOWNER, &fakeDirectory{}, nil, `{"email":"new@example.com","role":"EDITOR"}`, http.StatusCreated},
		{"group", db.ProjectRoleOWNER, &fakeDirectory{}, nil, `{"group_id":"` + teamGroupID + `","role":"VIEWER"}`, http.StatusCreated},
		{"editor cannot add", db.ProjectRoleEDITOR, &fakeDirectory{}, nil, `{"email":"new@example.com","role":"VIEWER"}`, http.StatusForbidden},
		{"non-member", "", &fakeDirectory{}, nil, `{"email":"new@example.com","role":"VIEWER"}`, http.StatusNotFound},
		{"neither email nor group", db.ProjectRoleOWNER, &fakeDirectory{}, nil, `{"role":"VIEWER"}`, http.StatusUnprocessableEntity},
		{"both email and group", db.ProjectRoleOWNER, &fakeDirectory{}, nil, `{"email":"new@example.com","group_id":"` + teamGroupID + `","role":"VIEWER"}`, http.StatusUnprocessableEntity},
		{"unknown role", db.ProjectRoleOWNER, &fakeDirectory{}, nil, `{"email":"new@example.com","role":"REVIEWER"}`, http.StatusUnprocessableEntity},
		{"no directory", db.ProjectRoleOWNER, nil, nil, `{"email":"new@example.com","role":"VIEWER"}`, http.StatusServiceUnavailable},
		{"unknown email", db.ProjectRoleOWNER, &fakeDirectory{}, nil, `{"email":"nobody@example.com","role":"VIEWER"}`, http.StatusUnprocessableEntity},
		{"shared email", db.ProjectRoleOWNER, &fakeDirectory{}, nil, `{"email":"shared@example.com","role":"OWNER"}`, http.StatusConflict},
		{"directory down", db.ProjectRoleOWNER, &fakeDirectory{err: errors.New("down")}, nil, `{"email":"new@example.com","role":"VIEWER"}`, http.StatusServiceUnavailable},
		{"group not assignable", db.ProjectRoleOWNER, &fakeDirectory{}, nil, `{"group_id":"dddddddd-0000-4000-8000-000000000001","role":"VIEWER"}`, http.StatusUnprocessableEntity},
		{"unknown group", db.ProjectRoleOWNER, &fakeDirectory{}, nil, `{"group_id":"dddddddd-0000-4000-8000-000000000002","role":"VIEWER"}`, http.StatusUnprocessableEntity},
		{"group directory down", db.ProjectRoleOWNER, &fakeDirectory{err: errors.New("down")}, nil, `{"group_id":"` + teamGroupID + `","role":"VIEWER"}`, http.StatusServiceUnavailable},
		{"already member", db.ProjectRoleOWNER, &fakeDirectory{}, &pgconn.PgError{Code: "23505"}, `{"email":"new@example.com","role":"VIEWER"}`, http.StatusConflict},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeMembers(tc.role)
			store.createErr = tc.createErr
			var directory handlers.Directory
			if tc.directory != nil {
				directory = tc.directory
			}
			rr := newMemberAPI(t, store, directory).call(http.MethodPost, membersPath, tc.body)
			if rr.Code != tc.code {
				t.Fatalf("status = %d, want %d: %s", rr.Code, tc.code, rr.Body.String())
			}
			if tc.code != http.StatusCreated {
				return
			}
			if rr.Header().Get("Location") != membersPath+"/"+newMemberID {
				t.Fatalf("Location = %q", rr.Header().Get("Location"))
			}
			if strings.Contains(tc.body, "email") && store.upserted != "new-sub" {
				t.Fatalf("user created for subject %q, want new-sub", store.upserted)
			}
		})
	}
}

func TestProjectMembersUpdate(t *testing.T) {
	for _, tc := range []struct {
		name   string
		role   db.ProjectRole
		member string
		body   string
		alone  bool // remove the second Owner first
		code   int
	}{
		{"downgrade other owner", db.ProjectRoleOWNER, otherMemberID, `{"role":"VIEWER"}`, false, http.StatusOK},
		{"downgrade group", db.ProjectRoleOWNER, groupMemberID, `{"role":"VIEWER"}`, false, http.StatusOK},
		{"last owner", db.ProjectRoleOWNER, ownerMemberID, `{"role":"EDITOR"}`, true, http.StatusConflict},
		{"last owner stays owner", db.ProjectRoleOWNER, ownerMemberID, `{"role":"OWNER"}`, true, http.StatusOK},
		{"missing member", db.ProjectRoleOWNER, newMemberID, `{"role":"EDITOR"}`, false, http.StatusNotFound},
		{"editor cannot change roles", db.ProjectRoleEDITOR, groupMemberID, `{"role":"VIEWER"}`, false, http.StatusForbidden},
		{"bad member id", db.ProjectRoleOWNER, "nope", `{"role":"VIEWER"}`, false, http.StatusUnprocessableEntity},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeMembers(tc.role)
			if tc.alone {
				store.members = store.members[:1]
			}
			rr := newMemberAPI(t, store, &fakeDirectory{}).call(http.MethodPatch, membersPath+"/"+tc.member, tc.body)
			if rr.Code != tc.code {
				t.Fatalf("status = %d, want %d: %s", rr.Code, tc.code, rr.Body.String())
			}
		})
	}
}

func TestProjectMembersDelete(t *testing.T) {
	for _, tc := range []struct {
		name   string
		role   db.ProjectRole
		member string
		alone  bool
		code   int
	}{
		{"owner removes other", db.ProjectRoleOWNER, otherMemberID, false, http.StatusNoContent},
		{"owner removes group", db.ProjectRoleOWNER, groupMemberID, false, http.StatusNoContent},
		{"viewer leaves", db.ProjectRoleVIEWER, ownerMemberID, false, http.StatusNoContent},
		{"viewer removes other", db.ProjectRoleVIEWER, otherMemberID, false, http.StatusForbidden},
		{"last owner cannot leave", db.ProjectRoleOWNER, ownerMemberID, true, http.StatusConflict},
		{"missing member", db.ProjectRoleOWNER, newMemberID, false, http.StatusNotFound},
		{"non-member", "", otherMemberID, false, http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeMembers(tc.role)
			if tc.alone {
				store.members = store.members[:1]
			}
			rr := newMemberAPI(t, store, &fakeDirectory{}).call(http.MethodDelete, membersPath+"/"+tc.member, "")
			if rr.Code != tc.code {
				t.Fatalf("status = %d, want %d: %s", rr.Code, tc.code, rr.Body.String())
			}
		})
	}
}

func TestAssignableGroups(t *testing.T) {
	store := newFakeMembers(db.ProjectRoleVIEWER)
	rr := newMemberAPI(t, store, &fakeDirectory{}).call(http.MethodGet, "/api/v1/groups", "")
	var got []handlers.AssignableGroup
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil || rr.Code != http.StatusOK || len(got) != 1 || got[0].GroupID != teamGroupID {
		t.Fatalf("groups: %d %s", rr.Code, rr.Body.String())
	}
	if rr := newMemberAPI(t, store, nil).call(http.MethodGet, "/api/v1/groups", ""); rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("groups without directory: %d", rr.Code)
	}
	down := &fakeDirectory{err: errors.New("down")}
	if rr := newMemberAPI(t, store, down).call(http.MethodGet, "/api/v1/groups", ""); rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("groups with directory down: %d", rr.Code)
	}
}

func TestPermissionMatrix(t *testing.T) {
	for _, tc := range []struct {
		role  db.ProjectRole
		read  bool
		edit  bool
		admin bool
	}{
		{db.ProjectRoleVIEWER, true, false, false},
		{db.ProjectRoleEDITOR, true, true, false},
		{db.ProjectRoleOWNER, true, true, true},
		{"", false, false, false},
	} {
		if handlers.Allows(tc.role, handlers.PermRead) != tc.read ||
			handlers.Allows(tc.role, handlers.PermEdit) != tc.edit ||
			handlers.Allows(tc.role, handlers.PermManage) != tc.admin {
			t.Fatalf("permissions of %q do not match the specification", tc.role)
		}
	}
}

// captureAudit collects the "audit" log entries written while fn runs.
func captureAudit(t *testing.T, fn func()) []map[string]any {
	t.Helper()
	var buf strings.Builder
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	defer slog.SetDefault(previous)
	fn()
	var entries []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		var entry map[string]any
		if json.Unmarshal([]byte(line), &entry) == nil && entry["msg"] == "audit" {
			entries = append(entries, entry)
		}
	}
	return entries
}

func TestProjectMemberAuditLog(t *testing.T) {
	api := newMemberAPI(t, newFakeMembers(db.ProjectRoleOWNER), &fakeDirectory{})
	entries := captureAudit(t, func() {
		api.call(http.MethodPost, membersPath, `{"email":"new@example.com","role":"VIEWER"}`)
		api.call(http.MethodPatch, membersPath+"/"+otherMemberID, `{"role":"EDITOR"}`)
		api.call(http.MethodDelete, membersPath+"/"+groupMemberID, "")
		api.call(http.MethodPatch, membersPath+"/"+ownerMemberID, `{"role":"VIEWER"}`) // last Owner: 409, no entry
	})
	want := []map[string]any{
		{"event": "member.added", "member_type": "user", "role": "VIEWER"},
		{"event": "member.role_changed", "member": otherMemberID, "user": otherUserID, "before": "OWNER", "after": "EDITOR"},
		{"event": "member.removed", "member": groupMemberID, "group": teamGroupID, "before": "EDITOR", "self": false},
	}
	if len(entries) != len(want) {
		t.Fatalf("audit entries = %v, want %d", entries, len(want))
	}
	for i, fields := range want {
		if entries[i]["actor"] != authtest.UserID || entries[i]["project"] != projectID {
			t.Fatalf("entry %d has actor %v, project %v", i, entries[i]["actor"], entries[i]["project"])
		}
		for key, value := range fields {
			if entries[i][key] != value {
				t.Fatalf("entry %d: %s = %v, want %v (%v)", i, key, entries[i][key], value, entries[i])
			}
		}
		if _, ok := entries[i]["email"]; ok {
			t.Fatalf("entry %d contains an email address: %v", i, entries[i])
		}
	}

	// A Viewer leaving is recorded as removing themselves.
	viewer := newMemberAPI(t, newFakeMembers(db.ProjectRoleVIEWER), &fakeDirectory{})
	entries = captureAudit(t, func() { viewer.call(http.MethodDelete, membersPath+"/"+ownerMemberID, "") })
	if len(entries) != 1 || entries[0]["event"] != "member.removed" || entries[0]["self"] != true || entries[0]["before"] != "VIEWER" {
		t.Fatalf("leave audit = %v", entries)
	}
}
