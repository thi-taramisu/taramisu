package db

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// TxStarter is a connection that can start transactions, such as *pgxpool.Pool or pgx.Tx
// (a savepoint inside an existing transaction).
type TxStarter interface {
	DBTX
	Begin(context.Context) (pgx.Tx, error)
}

// Store is Queries plus the operations that need a transaction. Use it instead of New outside
// tests.
type Store struct {
	*Queries
	conn TxStarter
}

func NewStore(conn TxStarter) *Store {
	return &Store{Queries: New(conn), conn: conn}
}

// UpdateProjectMemberRole runs the generated query after locking the project row. The last-Owner
// guard in the query reads the other assignments; without the lock, two concurrent downgrades
// could each still see the other Owner and both succeed.
func (s *Store) UpdateProjectMemberRole(ctx context.Context, arg UpdateProjectMemberRoleParams) (row UpdateProjectMemberRoleRow, err error) {
	err = s.inProjectLock(ctx, arg.ProjectID, func(q *Queries) error {
		row, err = q.UpdateProjectMemberRole(ctx, arg)
		return err
	})
	return row, err
}

// DeleteProjectMember runs the generated query after locking the project row (see
// UpdateProjectMemberRole).
func (s *Store) DeleteProjectMember(ctx context.Context, arg DeleteProjectMemberParams) (row DeleteProjectMemberRow, err error) {
	err = s.inProjectLock(ctx, arg.ProjectID, func(q *Queries) error {
		row, err = q.DeleteProjectMember(ctx, arg)
		return err
	})
	return row, err
}

func (s *Store) inProjectLock(ctx context.Context, projectID pgtype.UUID, fn func(*Queries) error) error {
	tx, err := s.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.WithTx(tx)
	if _, err := q.LockTaraProject(ctx, projectID); err != nil {
		return err
	}
	if err := fn(q); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
