package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/logging"
)

func main() {
	os.Exit(exitCode())
}

func exitCode() int {
	logger, flush, err := logging.New(sentry.ClientOptions{
		Dsn:         os.Getenv("SENTRY_DSN"),
		Environment: os.Getenv("SENTRY_ENVIRONMENT"),
		Release:     os.Getenv("SENTRY_RELEASE"),
	}, os.Stderr)
	if err != nil {
		slog.Error("initialize logging", "error", err)
		return 1
	}
	slog.SetDefault(logger)
	defer func() {
		if !flush(5 * time.Second) {
			slog.New(slog.NewJSONHandler(os.Stderr, nil)).Warn("Sentry flush timed out")
		}
	}()
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		return 1
	}
	return 0
}

func run() error {
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer pool.Close()
	handler := httpapi.New(db.New(pool))
	if os.Getenv("SENTRY_DSN") != "" {
		handler = sentryhttp.New(sentryhttp.Options{Repanic: true}).Handle(handler)
	}
	server := &http.Server{Addr: addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("HTTP server shutdown failed", "error", err)
		}
	}()
	slog.Info("HTTP server listening", "address", addr)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
