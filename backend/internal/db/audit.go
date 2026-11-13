package db

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
)

// Audit history events. The catalog, including events still to be added, is in
// docs/internal/architecture/audit.md. Record changes use "<target type>.created", ".updated" and
// ".deleted" (see Created, Updated and Deleted).
const (
	EventMemberAdded       = "member.added"
	EventMemberRoleChanged = "member.role_changed"
	EventMemberRemoved     = "member.removed"
	EventProjectDeleted    = TargetProject + ".deleted"
)

// Target types of audit events.
const (
	TargetProject        = "project"
	TargetProjectMember  = "project_member"
	TargetItemDefinition = "item_definition"
)

// Actor is who makes a change. Every audit event records it.
type Actor struct {
	UserID    pgtype.UUID // iam_user.id
	RequestID string      // links the event to the request's log lines; may be empty
}

// Change is one event of the audit history, as returned by the function passed to Store.Audit.
// Before and After are stored as JSON; nil stores NULL. A zero Change (no Event) means that the
// change was a no-op and nothing is recorded.
type Change struct {
	Event      string
	ProjectID  pgtype.UUID
	TargetType string
	TargetID   pgtype.UUID
	Before     any
	After      any
}

// Created describes a new record; after is the record as the API returns it.
func Created(targetType string, projectID, id pgtype.UUID, after any) Change {
	return Change{Event: targetType + ".created", ProjectID: projectID, TargetType: targetType, TargetID: id, After: after}
}

// Updated describes a changed record, or returns a zero Change if before and after are stored as the
// same JSON.
func Updated(targetType string, projectID, id pgtype.UUID, before, after any) Change {
	b, errBefore := json.Marshal(before)
	a, errAfter := json.Marshal(after)
	if errBefore == nil && errAfter == nil && bytes.Equal(b, a) {
		return Change{}
	}
	return Change{Event: targetType + ".updated", ProjectID: projectID, TargetType: targetType, TargetID: id, Before: before, After: after}
}

// Deleted describes a deleted record; before is the record as the API returned it.
func Deleted(targetType string, projectID, id pgtype.UUID, before any) Change {
	return Change{Event: targetType + ".deleted", ProjectID: projectID, TargetType: targetType, TargetID: id, Before: before}
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

func insertEvent(ctx context.Context, q *Queries, actor Actor, c Change) error {
	before, err := encodeState(c.Before)
	if err != nil {
		return err
	}
	after, err := encodeState(c.After)
	if err != nil {
		return err
	}
	var requestID *string
	if actor.RequestID != "" {
		requestID = &actor.RequestID
	}
	return q.InsertAuditEvent(ctx, InsertAuditEventParams{
		ProjectID:   c.ProjectID,
		ActorUserID: actor.UserID,
		Event:       c.Event,
		TargetType:  c.TargetType,
		TargetID:    c.TargetID,
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
func logEvent(ctx context.Context, actor Actor, c Change) {
	attrs := []any{
		"event", c.Event,
		"actor", actor.UserID.String(),
		"project", c.ProjectID.String(),
		"target_type", c.TargetType,
		"target", c.TargetID.String(),
	}
	if before, ok := c.Before.(MemberState); ok {
		attrs = append(attrs, "before_role", before.Role)
	}
	if after, ok := c.After.(MemberState); ok {
		attrs = append(attrs, "after_role", after.Role)
	}
	slog.InfoContext(ctx, "audit", attrs...)
}
