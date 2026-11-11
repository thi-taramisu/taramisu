package db

import (
	"context"
	"errors"
	"fmt"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// ErrProjectNotFound is returned when the project of a change does not exist (any more).
var ErrProjectNotFound = errors.New("project not found")

// ErrNestedAudit is returned when Audit is called with a context that already carries its
// transaction: the inner event would be logged before the outer change is committed.
var ErrNestedAudit = errors.New("db: Audit called inside Audit")

// TxStarter is a connection that can start transactions, such as *pgxpool.Pool or pgx.Tx
// (a savepoint inside an existing transaction).
type TxStarter interface {
	DBTX
	Begin(context.Context) (pgx.Tx, error)
}

// Store is Queries plus the operations that need a transaction. Use it instead of New outside
// tests.
//
// Every change that the audit history records runs through Audit, which stores the change and its
// event in one transaction (docs/internal/architecture/audit.md). Where a Store method has the name
// of a generated query, it hides that query and takes an Actor, so a caller cannot run the change
// without its lock and its event by accident.
type Store struct {
	*Queries
	conn TxStarter
}

func NewStore(conn TxStarter) *Store {
	return &Store{Queries: New(ctxConn{conn}), conn: conn}
}

type txKey struct{}

// ErrLockOutsideTransaction is returned for a locking read (FOR UPDATE, FOR NO KEY UPDATE) that runs
// outside a transaction, usually because it got a context other than the one Audit passed on. Its
// lock would end with the statement, and the state it read could change before the write.
var ErrLockOutsideTransaction = errors.New("db: locking read outside a transaction")

// ctxConn runs a query in the transaction that Audit put into the context, or else on conn.
type ctxConn struct{ conn TxStarter }

func (c ctxConn) current(ctx context.Context, sql string) (DBTX, error) {
	if tx, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return tx, nil
	}
	// A Store built on a pgx.Tx (as in tests) is always inside a transaction.
	if _, inTx := c.conn.(pgx.Tx); !inTx && isLockingRead(sql) {
		return nil, ErrLockOutsideTransaction
	}
	return c.conn, nil
}

// lockingClause matches the row-locking clauses of PostgreSQL in any case and spacing.
var lockingClause = regexp.MustCompile(`(?i)\bFOR\s+(NO\s+KEY\s+UPDATE|UPDATE|SHARE|KEY\s+SHARE)\b`)

func isLockingRead(sql string) bool { return lockingClause.MatchString(sql) }

func (c ctxConn) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	conn, err := c.current(ctx, sql)
	if err != nil {
		return pgconn.CommandTag{}, err
	}
	return conn.Exec(ctx, sql, args...)
}

func (c ctxConn) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	conn, err := c.current(ctx, sql)
	if err != nil {
		return nil, err
	}
	return conn.Query(ctx, sql, args...)
}

func (c ctxConn) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	conn, err := c.current(ctx, sql)
	if err != nil {
		return errRow{err}
	}
	return conn.QueryRow(ctx, sql, args...)
}

type errRow struct{ err error }

func (r errRow) Scan(...any) error { return r.err }

// Audit runs fn in a transaction and stores the change that fn returns in the same transaction, so
// a change is never stored without its event and a failed change leaves none. Store queries that fn
// runs with the context it receives take part in the transaction; queries with any other context do
// not, and can block on the transaction's own row locks. Audit cannot be nested. After the commit,
// the event is also written as an "audit" log line.
func (s *Store) Audit(ctx context.Context, actor Actor, fn func(ctx context.Context) (Change, error)) error {
	if _, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return ErrNestedAudit
	}
	tx, err := s.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, txKey{}, tx)
	change, err := fn(txCtx)
	if err != nil {
		return err
	}
	if change.Event != "" {
		if err := insertEvent(txCtx, s.Queries, actor, change); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if change.Event != "" {
		logEvent(ctx, actor, change)
	}
	return nil
}

// lockProject locks the project row for the rest of the transaction in ctx with FOR NO KEY UPDATE.
// It serializes membership changes, but does not block writes to the project's content.
func (s *Store) lockProject(ctx context.Context, projectID pgtype.UUID) error {
	return projectLock(s.LockTaraProject(ctx, projectID))
}

// lockProjectForDelete locks the project row with FOR UPDATE at once, so the deletion waits for
// content writes in progress instead of deadlocking with them when the DELETE upgrades the lock.
func (s *Store) lockProjectForDelete(ctx context.Context, projectID pgtype.UUID) error {
	return projectLock(s.LockTaraProjectForDelete(ctx, projectID))
}

func projectLock(_ pgtype.UUID, err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrProjectNotFound
	}
	return err
}

// AddProjectMemberParams describes a new role assignment. Set exactly one of UserSubject (the
// Authentik token subject) and GroupExternalID (the Authentik group UUID).
type AddProjectMemberParams struct {
	ProjectID       pgtype.UUID
	UserSubject     string
	GroupExternalID string
	Role            ProjectRole
}

// AddProjectMember creates the iam_user or iam_group row if needed and assigns the role. Users who
// never signed in have no iam_user row yet.
func (s *Store) AddProjectMember(ctx context.Context, actor Actor, arg AddProjectMemberParams) (id pgtype.UUID, err error) {
	err = s.Audit(ctx, actor, func(ctx context.Context) (Change, error) {
		if err := s.lockProject(ctx, arg.ProjectID); err != nil {
			return Change{}, err
		}
		state := MemberState{Role: arg.Role}
		if arg.UserSubject != "" {
			rawID, err := s.UpsertIAMUser(ctx, arg.UserSubject)
			if err != nil {
				return Change{}, err
			}
			if err := state.UserID.Scan(rawID); err != nil {
				return Change{}, fmt.Errorf("parse iam_user id: %w", err)
			}
			if id, err = s.CreateUserMember(ctx, CreateUserMemberParams{ProjectID: arg.ProjectID, UserID: state.UserID, Role: arg.Role}); err != nil {
				return Change{}, err
			}
		} else {
			var err error
			if state.GroupID, err = s.UpsertIAMGroup(ctx, arg.GroupExternalID); err != nil {
				return Change{}, err
			}
			if id, err = s.CreateGroupMember(ctx, CreateGroupMemberParams{ProjectID: arg.ProjectID, GroupID: state.GroupID, Role: arg.Role}); err != nil {
				return Change{}, err
			}
		}
		return Change{Event: EventMemberAdded, ProjectID: arg.ProjectID, TargetType: TargetProjectMember, TargetID: id, After: state}, nil
	})
	return id, err
}

// UpdateProjectMemberRole runs the guarded update after locking the project row. The last-Owner guard
// in the query reads the other assignments; without the lock, two concurrent downgrades could each
// still see the other Owner and both succeed. Setting the current role again records nothing.
func (s *Store) UpdateProjectMemberRole(ctx context.Context, actor Actor, arg UpdateProjectMemberRoleParams) (row UpdateProjectMemberRoleRow, err error) {
	err = s.Audit(ctx, actor, func(ctx context.Context) (Change, error) {
		if err := s.lockProject(ctx, arg.ProjectID); err != nil {
			return Change{}, err
		}
		var err error
		if row, err = s.Queries.UpdateProjectMemberRole(ctx, arg); err != nil || row.PreviousRole == arg.Role {
			return Change{}, err
		}
		before := MemberState{Role: row.PreviousRole, UserID: row.UserID, GroupID: row.GroupID}
		after := before
		after.Role = arg.Role
		return Change{
			Event: EventMemberRoleChanged, ProjectID: arg.ProjectID, TargetType: TargetProjectMember, TargetID: row.ID,
			Before: before, After: after,
		}, nil
	})
	return row, err
}

// DeleteProjectMember runs the guarded delete after locking the project row (see
// UpdateProjectMemberRole).
func (s *Store) DeleteProjectMember(ctx context.Context, actor Actor, arg DeleteProjectMemberParams) (row DeleteProjectMemberRow, err error) {
	err = s.Audit(ctx, actor, func(ctx context.Context) (Change, error) {
		if err := s.lockProject(ctx, arg.ProjectID); err != nil {
			return Change{}, err
		}
		var err error
		if row, err = s.Queries.DeleteProjectMember(ctx, arg); err != nil {
			return Change{}, err
		}
		before := MemberState{Role: row.ProjectRole, UserID: row.UserID, GroupID: row.GroupID}
		return Change{Event: EventMemberRemoved, ProjectID: arg.ProjectID, TargetType: TargetProjectMember, TargetID: row.ID, Before: before}, nil
	})
	return row, err
}

// DeleteTaraProject deletes the project and records its name and role assignments, which the delete
// removes by cascade. It returns ErrProjectNotFound if the project does not exist.
func (s *Store) DeleteTaraProject(ctx context.Context, actor Actor, id pgtype.UUID) error {
	return s.Audit(ctx, actor, func(ctx context.Context) (Change, error) {
		if err := s.lockProjectForDelete(ctx, id); err != nil {
			return Change{}, err
		}
		assignments, err := s.ListProjectRoleAssignments(ctx, id)
		if err != nil {
			return Change{}, err
		}
		row, err := s.Queries.DeleteTaraProject(ctx, id)
		if err != nil {
			return Change{}, err
		}
		before := DeletedProjectState{Name: row.Name, Members: make([]AssignmentState, 0, len(assignments))}
		for _, a := range assignments {
			before.Members = append(before.Members, AssignmentState{ID: a.ID, MemberState: MemberState{Role: a.ProjectRole, UserID: a.UserID, GroupID: a.GroupID}})
		}
		return Deleted(TargetProject, id, id, before), nil
	})
}

// PurgeExpiredAuditEvents deletes the audit history of projects deleted before cutoff. If another
// replica is already running it, it returns 0 without waiting.
func (s *Store) PurgeExpiredAuditEvents(ctx context.Context, cutoff pgtype.Timestamptz) (int64, error) {
	tx, err := s.conn.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.WithTx(tx)
	locked, err := q.TryAuditRetentionLock(ctx)
	if err != nil || !locked {
		return 0, err
	}
	deleted, err := q.DeleteExpiredAuditEvents(ctx, cutoff)
	if err != nil {
		return 0, err
	}
	return deleted, tx.Commit(ctx)
}
