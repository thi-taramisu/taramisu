package logging

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/url"
	"time"

	"github.com/getsentry/sentry-go"
	sentryslog "github.com/getsentry/sentry-go/slog"
)

// New writes JSON logs to output and forwards them to Sentry when a DSN is set.
// Call the returned flush function before exiting.
func New(options sentry.ClientOptions, output io.Writer) (*slog.Logger, func(time.Duration) bool, error) {
	console := slog.NewJSONHandler(output, nil)
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
	client, err := sentry.NewClient(options)
	if err != nil {
		return nil, nil, err
	}
	ctx := sentry.SetHubOnContext(context.Background(), sentry.NewHub(client, sentry.NewScope()))
	// HTTP middleware clones this hub to isolate each request.
	sentry.CurrentHub().BindClient(client)
	remote := sentryslog.Option{LogLevel: []slog.Level{slog.LevelInfo, slog.LevelWarn, slog.LevelError}}.NewSentryHandler(ctx)
	return slog.New(multiHandler{console, remote}), client.Flush, nil
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
