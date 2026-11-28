package handlers

import (
	"context"
	"fmt"
	"net/http"
	"reflect"
	"strconv"
	"strings"

	"github.com/danielgtaylor/huma/v2"
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

// requirePrecondition rejects a request without If-Match with 428 if the context requires it. It runs
// after the access check, so that a caller without access still gets 403 or 404.
func requirePrecondition(api huma.API) func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		if required, _ := ctx.Context().Value(requireIfMatchKey{}).(bool); required && ctx.Header("If-Match") == "" {
			_ = huma.WriteErr(api, ctx, http.StatusPreconditionRequired,
				"send the version the change is based on as If-Match; read the record to get its ETag")
			return
		}
		next(ctx)
	}
}

// etag is the entity tag of a record version. It is strong: equal tags mean equal stored fields.
func etag(version int32) string { return `"` + strconv.FormatInt(int64(version), 10) + `"` }

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
