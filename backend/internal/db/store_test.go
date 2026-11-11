package db

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// poolStub stands in for a pool (not a pgx.Tx) and records whether a query reached it.
type poolStub struct{ reached bool }

func (p *poolStub) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	p.reached = true
	return pgconn.CommandTag{}, nil
}
func (p *poolStub) Query(context.Context, string, ...any) (pgx.Rows, error) {
	p.reached = true
	return nil, nil
}
func (p *poolStub) QueryRow(context.Context, string, ...any) pgx.Row {
	p.reached = true
	return nil
}
func (p *poolStub) Begin(context.Context) (pgx.Tx, error) { return nil, errors.New("not used") }

func TestLockingReadOutsideAuditIsRefused(t *testing.T) {
	for _, tc := range []struct {
		sql     string
		locking bool
	}{
		{"SELECT id FROM t WHERE id = $1 FOR UPDATE", true},
		{"SELECT id FROM t WHERE id = $1 FOR NO KEY UPDATE", true},
		{"select id from t for update", true},
		{"SELECT id FROM t\nFOR\n  NO KEY   UPDATE", true},
		{"SELECT id FROM t FOR SHARE", true},
		{"SELECT id FROM t FOR KEY SHARE", true},
		{"UPDATE t SET name = $1 RETURNING *", false},
		{"SELECT id FROM t WHERE information_for_update_check = 1", false},
	} {
		pool := &poolStub{}
		conn := ctxConn{pool}
		_, execErr := conn.Exec(context.Background(), tc.sql)
		rows, queryErr := conn.Query(context.Background(), tc.sql)
		if rows != nil {
			rows.Close()
		}
		var rowErr error
		if !tc.locking {
			conn.QueryRow(context.Background(), tc.sql)
		} else {
			rowErr = conn.QueryRow(context.Background(), tc.sql).Scan()
		}
		for name, err := range map[string]error{"Exec": execErr, "Query": queryErr, "QueryRow": rowErr} {
			if tc.locking != errors.Is(err, ErrLockOutsideTransaction) {
				t.Errorf("%s(%q) = %v, want refused: %v", name, tc.sql, err, tc.locking)
			}
		}
		if tc.locking == pool.reached {
			t.Errorf("%q reached the pool: %v, want %v", tc.sql, pool.reached, !tc.locking)
		}
	}
}
