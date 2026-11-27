// Package logging configures the API's structured logs and correlates them per request.
//
// Every log line is JSON on stderr. Lines written with a request context (slog.InfoContext and
// friends) carry the request's ID, so the NGINX access log, the request log, and audit and
// security entries of one request can be joined.
package logging

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
	sentryslog "github.com/getsentry/sentry-go/slog"
)

// New writes JSON logs to output and forwards application diagnostics to Sentry when a DSN is set.
// Call the returned flush function before exiting.
func New(options sentry.ClientOptions, output io.Writer, level slog.Leveler) (*slog.Logger, func(time.Duration) bool, error) {
	console := NewHandler(output, level)
	if options.Dsn == "" {
		return slog.New(console), func(time.Duration) bool { return true }, nil
	}
	if options.Environment == "" {
		options.Environment = "development"
	}
	off := &sentry.KeyValueCollectionBehavior{Mode: sentry.CollectionOff}
	options.DataCollection = &sentry.DataCollection{
		UserInfo: sentry.Set(false), Cookies: off, QueryParams: off,
		HTTPHeaders: &sentry.HeaderCollectionConfig{Request: off, Response: off},
		HTTPBodies:  []sentry.BodyType{},
	}
	beforeSend := options.BeforeSend
	options.BeforeSend = func(event *sentry.Event, hint *sentry.EventHint) *sentry.Event {
		if beforeSend != nil {
			event = beforeSend(event, hint)
		}
		if event != nil && event.Request != nil {
			event.Request.Data = ""
			event.Request.Headers = nil
			event.Request.Cookies = ""
			event.Request.QueryString = ""
			event.Request.Env = nil
			if parsed, err := url.Parse(event.Request.URL); err == nil {
				parsed.RawQuery = ""
				parsed.User = nil
				event.Request.URL = parsed.String()
			}
		}
		return event
	}
	beforeSendLog := options.BeforeSendLog
	options.BeforeSendLog = func(log *sentry.Log) *sentry.Log {
		// Raw errors can include SQL input values or upstream response details.
		for key := range log.Attributes {
			if key == "error" || strings.HasSuffix(key, ".error") {
				delete(log.Attributes, key)
			}
		}
		if beforeSendLog != nil {
			return beforeSendLog(log)
		}
		return log
	}
	client, err := sentry.NewClient(options)
	if err != nil {
		return nil, nil, err
	}
	ctx := sentry.SetHubOnContext(context.Background(), sentry.NewHub(client, sentry.NewScope()))
	// HTTP middleware clones this hub to isolate each request.
	sentry.CurrentHub().BindClient(client)
	remote := sentryslog.Option{LogLevel: []slog.Level{slog.LevelInfo, slog.LevelWarn, slog.LevelError}}.NewSentryHandler(ctx)
	return slog.New(multiHandler{console, remoteHandler{Handler: remote, level: level}}), client.Flush, nil
}

// Request, access and audit records contain identifiers. Panic details stay local as well.
type remoteHandler struct {
	slog.Handler
	level slog.Leveler
}

func (h remoteHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return (h.level == nil || level >= h.level.Level()) && h.Handler.Enabled(ctx, level)
}

func (h remoteHandler) Handle(ctx context.Context, record slog.Record) error {
	switch record.Message {
	case "audit", "request", "access denied", "panic while handling request":
		return nil
	}
	return h.Handler.Handle(ctx, record)
}

func (h remoteHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return remoteHandler{Handler: h.Handler.WithAttrs(attrs), level: h.level}
}

func (h remoteHandler) WithGroup(name string) slog.Handler {
	return remoteHandler{Handler: h.Handler.WithGroup(name), level: h.level}
}

type multiHandler []slog.Handler

func (h multiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, handler := range h {
		if handler.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (h multiHandler) Handle(ctx context.Context, record slog.Record) error {
	var err error
	for _, handler := range h {
		if handler.Enabled(ctx, record.Level) {
			err = errors.Join(err, handler.Handle(ctx, record.Clone()))
		}
	}
	return err
}

func (h multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	result := make(multiHandler, len(h))
	for i, handler := range h {
		result[i] = handler.WithAttrs(attrs)
	}
	return result
}

func (h multiHandler) WithGroup(name string) slog.Handler {
	result := make(multiHandler, len(h))
	for i, handler := range h {
		result[i] = handler.WithGroup(name)
	}
	return result
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

// WithSentryHub gives each HTTP request an isolated scope without collecting its raw request data.
func WithSentryHub(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := sentry.SetHubOnContext(r.Context(), sentry.CurrentHub().Clone())
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
