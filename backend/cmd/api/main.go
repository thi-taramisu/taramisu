package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
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
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	queries := db.New(pool)
	authCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	iam, err := auth.New(authCtx, auth.Config{
		Issuer: os.Getenv("OIDC_ISSUER"), ClientID: os.Getenv("OIDC_CLIENT_ID"),
		ClientSecret: os.Getenv("OIDC_CLIENT_SECRET"), AppURL: os.Getenv("APP_URL"),
	}, queries)
	if err != nil {
		return fmt.Errorf("configure authentication: %w", err)
	}
	server := &http.Server{Addr: cfg.HTTPAddr, Handler: httpapi.New(queries, iam), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("HTTP server shutdown failed", "error", err)
		}
	}()
	slog.Info("HTTP server listening", "address", cfg.HTTPAddr)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
