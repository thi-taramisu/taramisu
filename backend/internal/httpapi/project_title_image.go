package httpapi

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net/http"
	"reflect"
	"strconv"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const maxTitleImageSize = 5 << 20

type projectTitleImageResponse struct {
	URL string `json:"url"`
}

func registerProjectTitleImage(api huma.API, h *Attachments, access handlers.ProjectAccessStore) {
	const path = "/api/v1/projects/{project_id}/title-image"
	for _, method := range []string{http.MethodPut, http.MethodGet, http.MethodDelete} {
		permission := handlers.PermManage
		if method == http.MethodGet {
			permission = handlers.PermRead
		}
		op := huma.Operation{Method: method, Path: path, OperationID: map[string]string{"PUT": "replace-project-title-image", "GET": "get-project-title-image", "DELETE": "delete-project-title-image"}[method],
			Summary: "Project title image (PNG or JPEG, up to 5 MiB and 20 million pixels)", Tags: []string{"Tara Project"}, Security: []map[string][]string{{"bearer": {}}},
			Parameters: []*huma.Param{{Name: "project_id", In: "path", Required: true, Schema: &huma.Schema{Type: "string", Format: "uuid"}}},
			Responses:  map[string]*huma.Response{"400": {Description: "Invalid multipart file"}, "401": {Description: "Authentication required"}, "403": {Description: "Owner role required for writes"}, "404": {Description: "Project or image not found"}, "422": {Description: "Invalid project ID"}, "503": {Description: "Storage or database unavailable"}},
		}
		switch method {
		case http.MethodPut:
			op.RequestBody = &huma.RequestBody{Required: true, Content: map[string]*huma.MediaType{"multipart/form-data": {Schema: &huma.Schema{Type: "object", Required: []string{"file"}, Properties: map[string]*huma.Schema{"file": {Type: "string", Format: "binary"}}}}}}
			op.Responses["200"] = &huma.Response{Description: "Image replaced; old object cleanup is retried automatically", Content: map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeOf(projectTitleImageResponse{}), true, "ProjectTitleImage")}}}
			op.Responses["413"] = &huma.Response{Description: "Image exceeds size or pixel limit"}
			op.Responses["415"] = &huma.Response{Description: "Not a valid PNG or JPEG image"}
		case http.MethodGet:
			op.Responses["200"] = &huma.Response{Description: "Image bytes; authenticated project read access required", Content: map[string]*huma.MediaType{"image/png": {Schema: &huma.Schema{Type: "string", Format: "binary"}}, "image/jpeg": {Schema: &huma.Schema{Type: "string", Format: "binary"}}}}
		case http.MethodDelete:
			op.Responses["204"] = &huma.Response{Description: "Image removed; object cleanup is retried automatically"}
		}
		handlers.RegisterRaw(api, op, handlers.InProject(access, handlers.ScopeProject("project_id"), permission), func(ctx huma.Context) {
			r, w := humachi.Unwrap(ctx)
			h.serveTitleImage(w, r)
		})
	}
}

func (h *Attachments) serveTitleImage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if h == nil {
		attachmentError(w, 503, "image storage unavailable")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()
	r = r.WithContext(ctx)
	project, err := parseUUID(chi.URLParam(r, "project_id"))
	if err != nil {
		attachmentError(w, 400, "invalid project ID")
		return
	}
	if r.Method == http.MethodPut {
		h.uploadTitleImage(w, r, project)
		return
	}
	if r.Method == http.MethodDelete {
		if _, err := h.queries.ClearProjectTitleImage(ctx, project); err != nil {
			attachmentError(w, 503, "database unavailable")
			return
		}
		h.tryTitleImageCleanup(ctx)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	a, err := h.queries.GetProjectTitleImage(ctx, project)
	if errors.Is(err, pgx.ErrNoRows) {
		attachmentError(w, 404, "title image not found")
		return
	}
	if err != nil {
		attachmentError(w, 503, "database unavailable")
		return
	}
	body, err := h.objects.Get(ctx, a.ID.String())
	if err != nil {
		attachmentError(w, 503, "storage unavailable")
		return
	}
	defer func() { _ = body.Close() }()
	w.Header().Set("Content-Type", a.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(a.SizeBytes, 10))
	w.Header().Set("Content-Disposition", "inline")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("Vary", "Authorization")
	if _, err := io.Copy(w, body); err != nil {
		slog.Warn("stream project title image", "error", err)
		panic(http.ErrAbortHandler)
	}
}

func (h *Attachments) uploadTitleImage(w http.ResponseWriter, r *http.Request, project pgtype.UUID) {
	r.Body = http.MaxBytesReader(w, r.Body, maxTitleImageSize+(64<<10))
	reader, err := r.MultipartReader()
	if err != nil {
		attachmentError(w, 400, "expected multipart/form-data")
		return
	}
	part, err := reader.NextPart()
	if err != nil || part.FormName() != "file" || part.FileName() == "" {
		attachmentError(w, 400, "expected file field")
		return
	}
	data, err := io.ReadAll(io.LimitReader(part, maxTitleImageSize+1))
	var tooLarge *http.MaxBytesError
	if len(data) > maxTitleImageSize || errors.As(err, &tooLarge) {
		attachmentError(w, 413, "image exceeds 5 MiB")
		return
	}
	if err != nil || len(data) == 0 {
		attachmentError(w, 400, "empty or incomplete file")
		return
	}
	if _, err = reader.NextPart(); !errors.Is(err, io.EOF) {
		attachmentError(w, 400, "expected exactly one file")
		return
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "png" && format != "jpeg") {
		attachmentError(w, 415, "expected valid PNG or JPEG")
		return
	}
	if int64(config.Width)*int64(config.Height) > 20_000_000 {
		attachmentError(w, 413, "image exceeds 20 million pixels")
		return
	}
	if _, _, err = image.Decode(bytes.NewReader(data)); err != nil {
		attachmentError(w, 415, "invalid image data")
		return
	}
	key := uuid.New()
	contentType := "image/" + format
	hash := sha256.Sum256(data)
	cleanup := func(parent context.Context) {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), 10*time.Second)
		defer cancel()
		if err := h.objects.Delete(ctx, key.String()); err != nil {
			slog.Error("cleanup failed title image upload", "key", key.String(), "error", err)
		}
	}
	if err := h.objects.Put(r.Context(), key.String(), contentType, int64(len(data)), bytes.NewReader(data)); err != nil {
		cleanup(r.Context())
		attachmentError(w, 503, "storage unavailable")
		return
	}
	if _, err := h.queries.ReplaceProjectTitleImage(r.Context(), db.ReplaceProjectTitleImageParams{ProjectID: project, ID: pgtype.UUID{Bytes: key, Valid: true}, ContentType: contentType, SizeBytes: int64(len(data)), Sha256: hex.EncodeToString(hash[:])}); err != nil {
		cleanup(r.Context())
		attachmentError(w, 503, "database unavailable")
		return
	}
	h.tryTitleImageCleanup(r.Context())
	attachmentJSON(w, 200, projectTitleImageResponse{URL: "/api/v1/projects/" + project.String() + "/title-image"})
}

func (h *Attachments) tryTitleImageCleanup(ctx context.Context) {
	if err := h.cleanupTitleImages(ctx); err != nil {
		slog.Warn("project title image cleanup queued for retry", "error", err)
	}
}

// An image becomes an orphan atomically when replaced, removed, or its project
// is deleted. Metadata survives until S3 deletion succeeds, including restarts.
func (h *Attachments) cleanupTitleImages(ctx context.Context) error {
	cursor := pgtype.UUID{Valid: true}
	for {
		rows, err := h.queries.ListOrphanedProjectTitleImages(ctx, cursor)
		if err != nil || len(rows) == 0 {
			return err
		}
		for _, a := range rows {
			attempt, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := h.objects.Delete(attempt, a.ID.String())
			if err == nil {
				err = h.queries.DeleteOrphanedProjectTitleImage(attempt, a.ID)
			}
			cancel()
			if err != nil {
				slog.Warn("retry title image deletion", "id", a.ID.String(), "error", err)
			}
			cursor = a.ID
		}
	}
}
