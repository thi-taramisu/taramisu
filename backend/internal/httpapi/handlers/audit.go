package handlers

import (
	"context"

	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/logging"
)

// auditActor returns who makes the change in ctx, for the audit history. The store records the event
// and writes the "audit" log line (see db.Store).
func auditActor(ctx context.Context) (db.Actor, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return db.Actor{}, err
	}
	return db.Actor{UserID: userID, RequestID: logging.RequestID(ctx)}, nil
}
