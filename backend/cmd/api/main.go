package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/config"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/logging"
)

// After SIGTERM, shutdownTimeout bounds how long in-flight requests may finish and poolCloseTimeout how long
// the database pool may then take to close. Together they stay below stop_grace_period (10s) of the api
// service in deploy/compose.backend.yaml, after which Docker sends SIGKILL; keep the three in sync.
const (
	shutdownTimeout  = 8 * time.Second
	poolCloseTimeout = time.Second
)

func main() {
	logLevel := logging.Setup(os.Stderr)
	if err := run(logLevel); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run(logLevel *slog.LevelVar) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logLevel.Set(cfg.LogLevel)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	// Once shutdown starts, restore default signal handling so a second signal terminates immediately.
	context.AfterFunc(ctx, stop)
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer closePool(pool, poolCloseTimeout)
	queries := db.NewStore(pool)
	// Deferred after closePool, so the cleanup is cancelled before the pool closes, also when run returns early.
	purgeCtx, stopPurge := context.WithCancel(ctx)
	defer stopPurge()
	go purgeAuditEvents(purgeCtx, queries, cfg.AuditRetentionAfterDelete, auditCleanupInterval, auditCleanupRetry)
	iam, err := auth.New(ctx, auth.Config{
		Issuer:   cfg.OIDCIssuer,
		ClientID: cfg.OIDCClientID,
		JWKSURL:  cfg.OIDCJWKSURL,
	}, queries)
	if err != nil {
		return fmt.Errorf("configure authentication: %w", err)
	}
	var opts []httpapi.Option
	if cfg.AuthentikURL != "" && cfg.AuthentikToken != "" {
		directory, err := auth.NewDirectoryResolver(auth.DirectoryConfig{
			BaseURL: cfg.AuthentikURL,
			Token:   cfg.AuthentikToken,
			TTL:     cfg.AuthentikMetadataCacheTTL,
		})
		if err != nil {
			return fmt.Errorf("configure Authentik directory: %w", err)
		}
		opts = append(opts, httpapi.WithDirectory(directory))
	} else {
		slog.Warn("AUTHENTIK_API_URL or AUTHENTIK_API_TOKEN not set: member names are hidden and adding members is disabled")
	}
	server := &http.Server{Handler: httpapi.New(queries, iam, opts...), ReadHeaderTimeout: 5 * time.Second}
	listener, err := net.Listen("tcp", cfg.HTTPAddr)
	if err != nil {
		return err
	}
	slog.Info("HTTP server listening", "address", listener.Addr().String())
	// The deferred closePool runs only after serve has drained in-flight requests.
	return serve(ctx, server, listener, shutdownTimeout)
}

// closePool closes the pool but gives up after timeout, so a handler that ignores its cancelled context and
// keeps a connection cannot hold the process until SIGKILL.
func closePool(pool interface{ Close() }, timeout time.Duration) {
	closed := make(chan struct{})
	go func() {
		pool.Close()
		close(closed)
	}()
	select {
	case <-closed:
	case <-time.After(timeout):
		slog.Error("database pool did not close in time; exiting with connections still in use", "timeout", timeout)
	}
}

// serve handles requests until ctx is cancelled or Serve fails, then stops accepting connections and waits up
// to timeout for in-flight requests to finish. Serve returns as soon as Shutdown starts, so returning on that
// alone would cut off requests that are still running. It returns Serve's error, or nil for a planned stop.
func serve(ctx context.Context, server *http.Server, listener net.Listener, timeout time.Duration) error {
	serveErr := make(chan error, 1)
	go func() { serveErr <- server.Serve(listener) }()
	var failed error
	select {
	case failed = <-serveErr:
		// Serve stopped on its own, e.g. because Accept failed; requests it already accepted still run.
	case <-ctx.Done():
	}
	drain(ctx, server, timeout)
	if failed != nil {
		return failed
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// drain shuts the server down gracefully. Requests still running after timeout get their connections closed,
// which cancels their contexts; that is logged, not returned, because a planned stop is not a crash. It logs
// right away because the deferred closePool in run may still wait for those requests.
func drain(ctx context.Context, server *http.Server, timeout time.Duration) {
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), timeout)
	defer cancel()
	err := server.Shutdown(shutdownCtx)
	switch {
	case err == nil:
	case errors.Is(err, context.DeadlineExceeded):
		slog.Error("HTTP server did not drain in time; closing remaining connections", "timeout", timeout)
		if err := server.Close(); err != nil {
			slog.Error("closing remaining HTTP connections failed", "error", err)
		}
	default:
		// Shutdown still waited for in-flight requests; only closing the listener failed.
		slog.Error("closing the HTTP listener failed during shutdown", "error", err)
	}
}
