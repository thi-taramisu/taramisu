package handlers

import (
	"context"
	"fmt"
	"net/http"
	"reflect"
	"strconv"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// IfMatch is embedded in the input of every PUT, PATCH, and DELETE on a versioned record, so that a
// change based on an outdated state is rejected instead of overwriting someone else's change
// (docs/internal/architecture/backend/backend-architecture.md#conflicting-edits).
type IfMatch struct {
	IfMatch string `header:"If-Match" doc:"Version the change is based on, as an entity tag in quotes: the ETag header, or the version field in quotes, for example \"3\" for version 3. If it is outdated, the change is rejected with 412. Without it, the change is rejected with 428 where the server requires it (REQUIRE_IF_MATCH); otherwise it is not checked."`
}

// check compares the precondition with the current version of the locked record. Call it after
// the record has been locked (FOR UPDATE or FOR NO KEY UPDATE) in the same transaction, so that no other
// change can come in between.
func (p IfMatch) check(current int32) error {
	if p.IfMatch == "" {
		return nil // requirePrecondition has rejected it already if REQUIRE_IF_MATCH is set
	}
	for _, tag := range strings.Split(p.IfMatch, ",") {
		tag = strings.TrimSpace(tag)
		if tag == "*" || tag == etag(current) {
			return nil
		}
	}
	return huma.ErrorWithHeaders(
		huma.Error412PreconditionFailed("the record was changed in the meantime; reload it and apply the change again"),
		http.Header{"ETag": {etag(current)}},
	)
}

type requireIfMatchKey struct{}

// RequireIfMatch is HTTP middleware that marks every request, so that a change of a versioned record
// without If-Match is rejected with 428 (REQUIRE_IF_MATCH).
func RequireIfMatch(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requireIfMatchKey{}, true)))
	})
}

// requirePrecondition rejects a request without If-Match (or If-None-Match: *, where the operation
// can create the record) with 428 if the context requires it. Another If-None-Match does not count:
// it would let an upsert replace an existing record without comparing its version. It runs after
// the access check, so that a caller without access still gets 403 or 404.
func requirePrecondition(api huma.API, upsert bool) func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		sent := ctx.Header("If-Match") != "" || upsert && strings.TrimSpace(ctx.Header("If-None-Match")) == "*"
		if required, _ := ctx.Context().Value(requireIfMatchKey{}).(bool); required && !sent {
			message := "send the version the change is based on as If-Match; read the record to get its ETag"
			if upsert {
				message += ", or send If-None-Match: * to create the record"
			}
			_ = huma.WriteErr(api, ctx, http.StatusPreconditionRequired, message)
			return
		}
		next(ctx)
	}
}

// UpsertPrecondition is embedded in a PUT that creates the record if it does not exist yet: If-Match
// replaces an existing record, If-None-Match: * creates a missing one.
type UpsertPrecondition struct {
	IfMatch
	IfNoneMatch string `header:"If-None-Match" doc:"* to create the record only if it does not exist yet; if it does, the change is rejected with 412. Use If-Match to replace an existing record."`
}

// checkUpsert compares the preconditions with the locked record, or with its absence (exists false).
// If-Match needs an existing record (RFC 9110), and If-None-Match: * a missing one.
func (p UpsertPrecondition) checkUpsert(exists bool, current int32) error {
	if !exists {
		if p.IfMatch.IfMatch != "" {
			return huma.Error412PreconditionFailed("the record does not exist; send If-None-Match: * to create it")
		}
		return nil
	}
	for _, tag := range strings.Split(p.IfNoneMatch, ",") {
		// If-None-Match uses the weak comparison (RFC 9110), so W/"3" matches version 3 too.
		if tag = strings.TrimPrefix(strings.TrimSpace(tag), "W/"); tag == "*" || tag == etag(current) {
			return huma.ErrorWithHeaders(
				huma.Error412PreconditionFailed("the record exists already; reload it and send its ETag as If-Match to replace it"),
				http.Header{"ETag": {etag(current)}},
			)
		}
	}
	return p.check(current)
}

// etag is the entity tag of a record version. It is strong: equal tags mean equal stored fields.
func etag(version int32) string { return `"` + strconv.FormatInt(int64(version), 10) + `"` }

// isUpsert tells whether an operation's input embeds UpsertPrecondition.
func isUpsert(input reflect.Type) bool {
	field, ok := input.FieldByName("UpsertPrecondition")
	return ok && field.Anonymous && field.Type == reflect.TypeFor[UpsertPrecondition]()
}

// hasIfMatch tells whether an operation's input embeds IfMatch, so that Register can document the 412.
func hasIfMatch(input reflect.Type) bool {
	field, ok := input.FieldByName("IfMatch")
	return ok && field.Anonymous && field.Type == reflect.TypeFor[IfMatch]()
}

// documentCurrentETag adds the ETag header that check sends with a 412 to the registered operation.
// Huma builds the error responses while registering, so the header can only be added afterwards.
func documentCurrentETag(api huma.API, op huma.Operation) {
	if item := api.OpenAPI().Paths[op.Path]; item != nil {
		for _, registered := range []*huma.Operation{item.Put, item.Patch, item.Delete} {
			if registered == nil || registered.OperationID != op.OperationID {
				continue
			}
			if response := registered.Responses[strconv.Itoa(http.StatusPreconditionFailed)]; response != nil {
				if response.Headers == nil {
					response.Headers = map[string]*huma.Param{}
				}
				response.Headers["ETag"] = &huma.Param{
					Description: "Current version of the record, to reload it and send with the next change.",
					Schema:      &huma.Schema{Type: huma.TypeString},
				}
				return
			}
		}
	}
	panic(fmt.Sprintf("%s %s: registered operation %s with a 412 response not found", op.Method, op.Path, op.OperationID))
}

// updated returns the audit change of an update and the record to return. Audit rolls back a change
// that records no event, so then the record as it was before is returned: the updated one carries a
// version that was never committed, and a client would send it as an outdated If-Match.
func updated[R, B any](targetType string, projectID, id pgtype.UUID, before, after R, body func(R) B) (db.Change, R) {
	change := db.Updated(targetType, projectID, id, body(before), body(after))
	if change.Event == "" {
		return change, before
	}
	return change, after
}
