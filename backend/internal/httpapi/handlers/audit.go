package handlers

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/logging"
)

// Auditor runs a change and records it in the audit history in one transaction (db.Store.Audit).
// Store calls made with the context passed to change take part in that transaction.
type Auditor interface {
	Audit(ctx context.Context, actor db.Actor, change func(ctx context.Context) (db.Change, error)) error
}

// audit runs change for the caller in ctx and records the db.Change it returns. Inside change, use
// only the context it receives; build the change with db.Created, db.Updated, or db.Deleted.
func audit(ctx context.Context, a Auditor, change func(ctx context.Context) (db.Change, error)) error {
	actor, err := auditActor(ctx)
	if err != nil {
		return err
	}
	return a.Audit(ctx, actor, change)
}

// auditActor returns who makes the change in ctx, for the audit history.
func auditActor(ctx context.Context) (db.Actor, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return db.Actor{}, err
	}
	return db.Actor{UserID: userID, RequestID: logging.RequestID(ctx)}, nil
}

// projectSettings is what project.created and project.updated record. The description is free text,
// so only whether it changed is recorded.
type projectSettings struct {
	Name               string      `json:"name"`
	DescriptionChanged bool        `json:"description_changed,omitempty"`
	FirstOwner         pgtype.UUID `json:"first_owner,omitzero"` // iam_user.id; project.created only
}
