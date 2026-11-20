package handlers

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
)

// audit writes one structured log entry for a change listed in the specification's "Audit" section.
// It records IDs only, never names or email addresses.
func audit(ctx context.Context, event string, attrs ...any) {
	args := make([]any, 0, 4+len(attrs))
	args = append(args, "event", event, "actor", auth.UserFromContext(ctx).ID)
	slog.InfoContext(ctx, "audit", append(args, attrs...)...)
}

// memberAttrs describes the member a change applies to, followed by extra key-value pairs.
func memberAttrs(projectID pgtype.UUID, m ProjectMember, extra ...any) []any {
	attrs := []any{"project", projectID.String(), "member", m.ID, "member_type", m.Type}
	if m.UserID != nil {
		attrs = append(attrs, "user", *m.UserID)
	}
	if m.GroupID != nil {
		attrs = append(attrs, "group", *m.GroupID)
	}
	return append(attrs, extra...)
}
