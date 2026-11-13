package db

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
)

// Audit history events. The catalog, including events still to be added, is in
// docs/internal/architecture/audit.md.
const (
	EventMemberAdded       = "member.added"
	EventMemberRoleChanged = "member.role_changed"
	EventMemberRemoved     = "member.removed"
	EventProjectDeleted    = "project.deleted"
)

// Target types of audit events.
const (
	TargetProject       = "project"
	TargetProjectMember = "project_member"
)

// Actor is who makes a change. Every audit event records it.
type Actor struct {
	UserID    pgtype.UUID // iam_user.id
	RequestID string      // links the event to the request's log lines; may be empty
}

// auditEntry is one event of the audit history. Before and After are stored as JSON; nil stores NULL.
// A zero auditEntry (no Event) means that the change was a no-op and nothing is recorded.
type auditEntry struct {
	Event      string
	ProjectID  pgtype.UUID
	TargetType string
	TargetID   pgtype.UUID
	Before     any
	After      any
}

// MemberState is a role assignment as recorded in member events. Exactly one of UserID (iam_user.id)
// and GroupID (iam_group.id) is set.
type MemberState struct {
	Role    ProjectRole `json:"role"`
	UserID  pgtype.UUID `json:"user_id,omitzero"`
	GroupID pgtype.UUID `json:"group_id,omitzero"`
}

// AssignmentState is a role assignment with its ID, as listed in project events.
type AssignmentState struct {
	ID pgtype.UUID `json:"id"`
	MemberState
}

// DeletedProjectState is what project.deleted keeps of a project: its name, so that operators can tell
// which project it was, and who had access. The description is free text and is not kept.
type DeletedProjectState struct {
	Name    string            `json:"name"`
	Members []AssignmentState `json:"members"`
}

func insertEvent(ctx context.Context, q *Queries, actor Actor, e auditEntry) error {
	before, err := encodeState(e.Before)
	if err != nil {
		return err
	}
	after, err := encodeState(e.After)
	if err != nil {
		return err
	}
	var requestID *string
	if actor.RequestID != "" {
		requestID = &actor.RequestID
	}
	return q.InsertAuditEvent(ctx, InsertAuditEventParams{
		ProjectID:   e.ProjectID,
		ActorUserID: actor.UserID,
		Event:       e.Event,
		TargetType:  e.TargetType,
		TargetID:    e.TargetID,
		Before:      before,
		After:       after,
		RequestID:   requestID,
	})
}

func encodeState(state any) ([]byte, error) {
	if state == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(state)
	if err != nil {
		return nil, fmt.Errorf("encode audit state: %w", err)
	}
	return encoded, nil
}

// logEvent writes a stored event as an "audit" log line, as an operations signal; the database is
// the record. Logs are read by a wider group than the database and kept under other rules, so the
// line carries IDs and roles only, never project data such as names.
func logEvent(ctx context.Context, actor Actor, e auditEntry) {
	attrs := []any{
		"event", e.Event,
		"actor", actor.UserID.String(),
		"project", e.ProjectID.String(),
		"target_type", e.TargetType,
		"target", e.TargetID.String(),
	}
	if before, ok := e.Before.(MemberState); ok {
		attrs = append(attrs, "before_role", before.Role)
	}
	if after, ok := e.After.(MemberState); ok {
		attrs = append(attrs, "after_role", after.Role)
	}
	slog.InfoContext(ctx, "audit", attrs...)
}
