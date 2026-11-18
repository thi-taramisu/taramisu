package db

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// ErrProjectNotFound is returned when the project of a change does not exist (any more).
var ErrProjectNotFound = errors.New("project not found")

// TxStarter is a connection that can start transactions, such as *pgxpool.Pool or pgx.Tx
// (a savepoint inside an existing transaction).
type TxStarter interface {
	DBTX
	Begin(context.Context) (pgx.Tx, error)
}

// Store is Queries plus the operations that need a transaction. Use it instead of New outside
// tests.
//
// Every change that the audit history records goes through audited, which stores the change and its
// event in one transaction (docs/internal/architecture/audit.md). Where such a method has the name of
// a generated query, it hides that query and takes an Actor, so a caller cannot run the change without
// its lock and its event by accident.
type Store struct {
	*Queries
	conn TxStarter
}

func NewStore(conn TxStarter) *Store {
	return &Store{Queries: New(conn), conn: conn}
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
	err = s.audited(ctx, actor, arg.ProjectID, lockForChange, func(q *Queries) (auditEntry, error) {
		state := MemberState{Role: arg.Role}
		if arg.UserSubject != "" {
			rawID, err := q.UpsertIAMUser(ctx, arg.UserSubject)
			if err != nil {
				return auditEntry{}, err
			}
			if err := state.UserID.Scan(rawID); err != nil {
				return auditEntry{}, fmt.Errorf("parse iam_user id: %w", err)
			}
			if id, err = q.CreateUserMember(ctx, CreateUserMemberParams{ProjectID: arg.ProjectID, UserID: state.UserID, Role: arg.Role}); err != nil {
				return auditEntry{}, err
			}
		} else {
			var err error
			if state.GroupID, err = q.UpsertIAMGroup(ctx, arg.GroupExternalID); err != nil {
				return auditEntry{}, err
			}
			if id, err = q.CreateGroupMember(ctx, CreateGroupMemberParams{ProjectID: arg.ProjectID, GroupID: state.GroupID, Role: arg.Role}); err != nil {
				return auditEntry{}, err
			}
		}
		return auditEntry{Event: EventMemberAdded, ProjectID: arg.ProjectID, TargetType: TargetProjectMember, TargetID: id, After: state}, nil
	})
	return id, err
}

// UpdateProjectMemberRole runs the guarded update after locking the project row. The last-Owner guard
// in the query reads the other assignments; without the lock, two concurrent downgrades could each
// still see the other Owner and both succeed. Setting the current role again records nothing.
func (s *Store) UpdateProjectMemberRole(ctx context.Context, actor Actor, arg UpdateProjectMemberRoleParams) (row UpdateProjectMemberRoleRow, err error) {
	err = s.audited(ctx, actor, arg.ProjectID, lockForChange, func(q *Queries) (auditEntry, error) {
		var err error
		if row, err = q.UpdateProjectMemberRole(ctx, arg); err != nil || row.PreviousRole == arg.Role {
			return auditEntry{}, err
		}
		before := MemberState{Role: row.PreviousRole, UserID: row.UserID, GroupID: row.GroupID}
		after := before
		after.Role = arg.Role
		return auditEntry{
			Event: EventMemberRoleChanged, ProjectID: arg.ProjectID, TargetType: TargetProjectMember, TargetID: row.ID,
			Before: before, After: after,
		}, nil
	})
	return row, err
}

// DeleteProjectMember runs the guarded delete after locking the project row (see
// UpdateProjectMemberRole).
func (s *Store) DeleteProjectMember(ctx context.Context, actor Actor, arg DeleteProjectMemberParams) (row DeleteProjectMemberRow, err error) {
	err = s.audited(ctx, actor, arg.ProjectID, lockForChange, func(q *Queries) (auditEntry, error) {
		var err error
		if row, err = q.DeleteProjectMember(ctx, arg); err != nil {
			return auditEntry{}, err
		}
		before := MemberState{Role: row.ProjectRole, UserID: row.UserID, GroupID: row.GroupID}
		return auditEntry{Event: EventMemberRemoved, ProjectID: arg.ProjectID, TargetType: TargetProjectMember, TargetID: row.ID, Before: before}, nil
	})
	return row, err
}

// DeleteTaraProject deletes the project and records its name and role assignments, which the delete
// removes by cascade. It returns ErrProjectNotFound if the project does not exist.
func (s *Store) DeleteTaraProject(ctx context.Context, actor Actor, id pgtype.UUID) error {
	return s.audited(ctx, actor, id, lockForDelete, func(q *Queries) (auditEntry, error) {
		assignments, err := q.ListProjectRoleAssignments(ctx, id)
		if err != nil {
			return auditEntry{}, err
		}
		row, err := q.DeleteTaraProject(ctx, id)
		if err != nil {
			return auditEntry{}, err
		}
		before := DeletedProjectState{Name: row.Name, Members: make([]AssignmentState, 0, len(assignments))}
		for _, a := range assignments {
			before.Members = append(before.Members, AssignmentState{ID: a.ID, MemberState: MemberState{Role: a.ProjectRole, UserID: a.UserID, GroupID: a.GroupID}})
		}
		return auditEntry{Event: EventProjectDeleted, ProjectID: id, TargetType: TargetProject, TargetID: id, Before: before}, nil
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

// Project lock modes for audited.
const (
	lockForChange = false // FOR NO KEY UPDATE: membership changes; content can still be written
	lockForDelete = true  // FOR UPDATE: deleting the project, which waits for concurrent content writes
)

// audited runs fn in a transaction and stores the audit event that fn returns in the same
// transaction, so a change is never stored without its event and a failed change leaves none. The
// project row is locked first, which serializes membership changes; a missing project returns
// ErrProjectNotFound. After the commit, the event is also written as an "audit" log line.
func (s *Store) audited(ctx context.Context, actor Actor, projectID pgtype.UUID, forDelete bool, fn func(*Queries) (auditEntry, error)) error {
	tx, err := s.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.WithTx(tx)
	lock := q.LockTaraProject
	if forDelete {
		lock = q.LockTaraProjectForDelete
	}
	if _, err := lock(ctx, projectID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrProjectNotFound
		}
		return err
	}
	entry, err := fn(q)
	if err != nil {
		return err
	}
	if entry.Event != "" {
		if err := insertEvent(ctx, q, actor, entry); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if entry.Event != "" {
		logEvent(ctx, actor, entry)
	}
	return nil
}
