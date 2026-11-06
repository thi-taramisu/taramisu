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
)

// shutdownTimeout bounds how long SIGTERM waits for in-flight requests. Docker sends SIGKILL 10s after
// SIGTERM, which leaves time to close the remaining connections and the database pool.
const shutdownTimeout = 8 * time.Second

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	// Once shutdown starts, restore default signal handling so a second signal terminates immediately.
	context.AfterFunc(ctx, stop)
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	queries := db.New(pool)
	iam, err := auth.New(ctx, auth.Config{
		Issuer:   cfg.OIDCIssuer,
		ClientID: cfg.OIDCClientID,
		JWKSURL:  cfg.OIDCJWKSURL,
	}, queries)
	if err != nil {
		return fmt.Errorf("configure authentication: %w", err)
	}
	server := &http.Server{Handler: httpapi.New(queries, iam), ReadHeaderTimeout: 5 * time.Second}
	listener, err := net.Listen("tcp", cfg.HTTPAddr)
	if err != nil {
		return err
	}
	slog.Info("HTTP server listening", "address", listener.Addr().String())
	// The deferred pool.Close runs only after serve has drained in-flight requests.
	return serve(ctx, server, listener, shutdownTimeout)
}

// serve handles requests until ctx is cancelled, then stops accepting connections and waits up to
// timeout for in-flight requests to finish. Serve returns as soon as Shutdown starts, so returning
// on that alone would cut off requests that are still running. Requests still running after timeout
// get their connections closed, which cancels their contexts; that is logged, not returned, because
// a planned stop is not a crash.
func serve(ctx context.Context, server *http.Server, listener net.Listener, timeout time.Duration) error {
	serveErr := make(chan error, 1)
	go func() { serveErr <- server.Serve(listener) }()
	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), timeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		// Log before returning: the deferred pool.Close in run may still wait for these requests.
		slog.Error("HTTP server did not drain in time; closing remaining connections", "timeout", timeout, "error", err)
		if err := server.Close(); err != nil {
			slog.Error("closing remaining HTTP connections failed", "error", err)
		}
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
