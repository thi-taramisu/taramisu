package handlers_test

import (
	"context"

	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// auditRecorder implements handlers.Auditor for fake stores: it runs the change without a transaction
// and keeps the recorded changes and their actors. Like db.Store, it rejects nested calls.
type auditRecorder struct {
	changes []db.Change
	actors  []db.Actor
}

type inAuditKey struct{}

func (r *auditRecorder) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	if ctx.Value(inAuditKey{}) != nil {
		return db.ErrNestedAudit
	}
	c, err := change(context.WithValue(ctx, inAuditKey{}, true))
	if err != nil {
		return err
	}
	if c.Event != "" {
		r.changes = append(r.changes, c)
		r.actors = append(r.actors, actor)
	}
	return nil
}

// Fakes that embed several store interfaces get Audit from more than one of them; these methods
// resolve the ambiguity.

func (healthQueries) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return new(auditRecorder).Audit(ctx, actor, change)
}

func (*riskFake) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return new(auditRecorder).Audit(ctx, actor, change)
}

func (*fakeAttackAccess) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return new(auditRecorder).Audit(ctx, actor, change)
}

func (*fakeDamage) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return new(auditRecorder).Audit(ctx, actor, change)
}

func (s *itemStore) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return s.audit.Audit(ctx, actor, change)
}

func (f *fakeProjects) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return f.audit.Audit(ctx, actor, change)
}

func (*fakeAttackPaths) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return new(auditRecorder).Audit(ctx, actor, change)
}

func (*fakeRatings) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return new(auditRecorder).Audit(ctx, actor, change)
}

func (*fakeLinks) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return new(auditRecorder).Audit(ctx, actor, change)
}

func (propertyQueries) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return new(auditRecorder).Audit(ctx, actor, change)
}

func (*assetStore) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return new(auditRecorder).Audit(ctx, actor, change)
}
