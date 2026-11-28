package db

import (
	"io/fs"
	"maps"
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

// unversionedTables have no version column: links have no fields to overwrite, users and groups are
// mirrored from Authentik, attachments are only uploaded and deleted, display ID counters are only
// raised by create queries, and the audit history and the status row are never edited.
var unversionedTables = []string{
	"service_status", "iam_user", "iam_group", "audit_event", "threat_damage_link", "threat_attack_path_link",
	"attachment", "display_id_counter",
}

var (
	createTable   = regexp.MustCompile(`(?ms)^CREATE TABLE (\w+) \((.*?)^\);`)
	anyCreate     = regexp.MustCompile(`(?im)^\s*CREATE\s+TABLE\b`)
	versionColumn = regexp.MustCompile(`(?m)^\s+version integer NOT NULL DEFAULT 1\b`)
	sqlComment    = regexp.MustCompile(`--[^\n]*`)
	sqlString     = regexp.MustCompile(`'(?:[^']|'')*'`)
	updateWord    = regexp.MustCompile(`(?i)\bUPDATE\b`)
	// lockOrAction is an UPDATE that changes no row by itself: a row lock (FOR [NO KEY] UPDATE) or a
	// foreign key action (ON UPDATE).
	lockOrAction = regexp.MustCompile(`(?i)\b(?:FOR|KEY|ON)\s+$`)
	upsertAction = regexp.MustCompile(`(?i)\bDO\s+$`)
	updateTarget = regexp.MustCompile(`(?i)^UPDATE\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+SET\b`)
	upsertInto   = regexp.MustCompile(`(?i)\bINSERT\s+INTO\s+(\w+)\b`)
	upsertSet    = regexp.MustCompile(`(?i)^UPDATE\s+SET\b`)
	clauseEnd    = regexp.MustCompile(`(?i)\b(?:WHERE|FROM|RETURNING)\b`)
)

// versionedTables reads the tables from the schema, true for those with a version column, and checks
// that every other table is listed in unversionedTables.
func versionedTables(t *testing.T) map[string]bool {
	t.Helper()
	schema, err := os.ReadFile("../../db/schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	tables := createTable.FindAllStringSubmatch(string(schema), -1)
	if n := len(anyCreate.FindAllString(string(schema), -1)); n != len(tables) {
		t.Fatalf("db/schema.sql has %d CREATE TABLE statements, but the test parsed %d; extend createTable", n, len(tables))
	}
	versioned := map[string]bool{}
	for _, m := range tables {
		has := versionColumn.MatchString(m[2])
		switch exempt := slices.Contains(unversionedTables, m[1]); {
		case has && exempt:
			t.Errorf("%s has a version column but is listed in unversionedTables", m[1])
		case !has && !exempt:
			t.Errorf("%s has no version column; add `version integer NOT NULL DEFAULT 1` or list it in unversionedTables", m[1])
		}
		versioned[m[1]] = has
	}
	if !slices.Contains(slices.Collect(maps.Values(versioned)), true) {
		t.Fatal("found no versioned table in db/schema.sql")
	}
	return versioned
}

// TestEveryUpdateRaisesTheVersion checks the queries statically, because Atlas manages triggers only
// in its paid edition: an update that does not raise the version would let a stale If-Match pass.
// Every UPDATE that writes rows must be parsed; one the test cannot parse (a quoted or qualified
// table, ONLY) fails instead of being skipped.
func TestEveryUpdateRaisesTheVersion(t *testing.T) {
	versioned := versionedTables(t)
	queries := os.DirFS("../../db/queries")
	files, err := fs.Glob(queries, "*.sql")
	if err != nil || len(files) == 0 {
		t.Fatalf("no query files: %v", err)
	}
	updates := 0
	for _, file := range files {
		content, err := fs.ReadFile(queries, file)
		if err != nil {
			t.Fatal(err)
		}
		sql := sqlString.ReplaceAllString(sqlComment.ReplaceAllString(string(content), ""), "''")
		for _, statement := range strings.Split(sql, ";") {
			for _, at := range updateWord.FindAllStringIndex(statement, -1) {
				head, rest := statement[:at[0]], statement[at[0]:]
				var table, alias, set string
				switch {
				case lockOrAction.MatchString(head):
					continue
				case upsertAction.MatchString(head):
					// The last INSERT before DO UPDATE is the upsert; earlier ones belong to a WITH clause.
					inserts := upsertInto.FindAllStringSubmatch(head, -1)
					if len(inserts) == 0 || !upsertSet.MatchString(rest) {
						t.Errorf("%s: cannot parse the upsert in %q", file, strings.TrimSpace(statement))
						continue
					}
					into := inserts[len(inserts)-1]
					table, alias, set = into[1], into[1], rest[upsertSet.FindStringIndex(rest)[1]:]
				default:
					m := updateTarget.FindStringSubmatchIndex(rest)
					if m == nil {
						t.Errorf("%s: cannot parse %q; write UPDATE <table> [alias] SET", file, strings.TrimSpace(statement))
						continue
					}
					table, alias, set = rest[m[2]:m[3]], rest[m[2]:m[3]], rest[m[1]:]
					if m[4] >= 0 {
						alias = rest[m[4]:m[5]]
					}
				}
				if end := clauseEnd.FindStringIndex(set); end != nil {
					set = set[:end[0]] // a bump in WHERE or RETURNING does not count
				}
				isVersioned, known := versioned[table]
				if !known {
					t.Errorf("%s: an update of %s, which is no table in db/schema.sql; write UPDATE <table> [alias] SET", file, table)
				}
				if !isVersioned {
					continue
				}
				updates++
				bump := regexp.MustCompile(`\bversion\s*=\s*` + regexp.QuoteMeta(alias) + `\.version\s*\+\s*1\b`)
				if !bump.MatchString(set) {
					t.Errorf("%s: an update of %s does not set version = %s.version + 1", file, table, alias)
				}
			}
		}
	}
	if updates == 0 {
		t.Fatal("found no update of a versioned table; is the pattern still right?")
	}
}

func TestUpdatedIgnoresOnlyTheRecordVersion(t *testing.T) {
	type record struct {
		Name    string `json:"name"`
		Version int32  `json:"version"`
	}
	type software struct {
		Version string `json:"version"` // a field of the record, not its record version
	}
	for _, c := range []struct {
		name          string
		before, after any
		changed       bool
	}{
		{"only the record version", record{"ECU", 1}, record{"ECU", 2}, false},
		{"through a pointer", &record{"ECU", 1}, &record{"ECU", 2}, false},
		{"a field and the version", record{"ECU", 1}, record{"Gateway", 2}, true},
		{"a field named version", software{"1.0"}, software{"1.1"}, true},
		{"no struct", map[string]any{"version": 1}, map[string]any{"version": 2}, true},
	} {
		change := Updated(TargetItemDefinition, pgtype.UUID{}, pgtype.UUID{}, c.before, c.after)
		if got := change.Event != ""; got != c.changed {
			t.Errorf("%s: recorded a change = %v, want %v", c.name, got, c.changed)
		}
	}
}
