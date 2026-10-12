package handlers

import (
	"context"
)

type Health struct{}

type StatusOutput struct {
	Body struct {
		Status string `json:"status"`
	}
}

func (h *Health) Live(ctx context.Context, _ *struct{}) (*StatusOutput, error) {
	out := &StatusOutput{}
	out.Body.Status = "ok"
	return out, nil
}
