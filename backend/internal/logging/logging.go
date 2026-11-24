// Package logging configures the API's structured logs and correlates them per request.
//
// Every log line is JSON on stderr. Lines written with a request context (slog.InfoContext and
// friends) carry the request's ID, so the NGINX access log, the request log, and audit and
// security entries of one request can be joined.
package logging

import (
	"context"
	"io"
	"log/slog"
)

// Setup installs a JSON logger on w as the default slog logger. The returned LevelVar starts at
// Info and can be changed once the configuration is loaded.
func Setup(w io.Writer) *slog.LevelVar {
	level := new(slog.LevelVar)
	slog.SetDefault(slog.New(NewHandler(w, level)))
	return level
}

// NewHandler returns a JSON handler that adds the request ID from the context to each record.
func NewHandler(w io.Writer, level slog.Leveler) slog.Handler {
	return contextHandler{slog.NewJSONHandler(w, &slog.HandlerOptions{Level: level})}
}

type contextHandler struct{ slog.Handler }

func (h contextHandler) Handle(ctx context.Context, r slog.Record) error {
	if id := RequestID(ctx); id != "" {
		r.AddAttrs(slog.String("request_id", id))
	}
	return h.Handler.Handle(ctx, r)
}

func (h contextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return contextHandler{h.Handler.WithAttrs(attrs)}
}

func (h contextHandler) WithGroup(name string) slog.Handler {
	return contextHandler{h.Handler.WithGroup(name)}
}
