package handlers

import (
	"context"
	"log/slog"

	"github.com/danielgtaylor/huma/v2"
)

type StatusReader interface {
	GetServiceStatus(context.Context) (string, error)
}

type Health struct {
	queries StatusReader
}

func NewHealth(queries StatusReader) *Health {
	return &Health{queries: queries}
}

type StatusOutput struct {
	Body struct {
		Status string `json:"status"`
	}
}

func (h *Health) Live(ctx context.Context, input *struct{}) (*StatusOutput, error) {
	out := &StatusOutput{}
	out.Body.Status = "ok"
	return out, nil
}

func (h *Health) Ready(ctx context.Context, input *struct{}) (*StatusOutput, error) {
	if _, err := h.queries.GetServiceStatus(ctx); err != nil {
		slog.Warn("database readiness check failed", "error", err)
		return nil, huma.Error503ServiceUnavailable("database unavailable")
	}
	return h.Live(ctx, input)
}
