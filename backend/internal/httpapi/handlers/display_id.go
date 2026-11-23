package handlers

import (
	"errors"
	"strconv"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Prefixes of the display IDs, the format the frontend shows (frontend/README.md#element-display-ids).
// See docs/internal/architecture/data-model.md#27-display-ids.
const (
	displayPrefixItem           = "IT"
	displayPrefixAsset          = "AS"
	displayPrefixDamageScenario = "DS"
	displayPrefixThreatScenario = "TS"
	displayPrefixAttackPath     = "AP"
)

// displayID formats a display number with its element type's prefix, for example DS-12.
func displayID(prefix string, number int32) string {
	return prefix + "-" + strconv.FormatInt(int64(number), 10)
}

// itemDeletedOnCreate returns a 404 if an element's create query failed because its item was deleted
// after the access check, and nil for any other error. The query reads the item's project for the display
// number, so it returns no row when the item was deleted before the statement, and a foreign key
// violation when the item was deleted during it.
func itemDeletedOnCreate(err error) error {
	var pgErr *pgconn.PgError
	if errors.Is(err, pgx.ErrNoRows) || errors.As(err, &pgErr) && pgErr.Code == "23503" {
		return huma.Error404NotFound("item definition not found")
	}
	return nil
}
