package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path"
	"reflect"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const maxAttachmentSize = 10 << 20

type ObjectStore interface {
	Put(context.Context, string, string, int64, io.ReadSeeker) error
	Get(context.Context, string) (io.ReadCloser, error)
	Delete(context.Context, string) error
}

type Attachments struct {
	queries *db.Queries
	objects ObjectStore
}

func NewAttachments(queries *db.Queries, objects ObjectStore) *Attachments {
	return &Attachments{queries: queries, objects: objects}
}

type attachmentMetadata struct {
	ID          string    `json:"id" format:"uuid"`
	ProjectID   string    `json:"project_id" format:"uuid"`
	FileName    string    `json:"file_name"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	SHA256      string    `json:"sha256"`
	UploadedBy  string    `json:"uploaded_by" format:"uuid"`
	CreatedAt   time.Time `json:"created_at"`
}

func metadata(a db.Attachment) attachmentMetadata {
	return attachmentMetadata{uuid.UUID(a.ID.Bytes).String(), uuid.UUID(a.ProjectID.Bytes).String(), a.FileName, a.ContentType, a.SizeBytes, a.Sha256, uuid.UUID(a.UploadedBy.Bytes).String(), a.CreatedAt.Time}
}

func registerAttachments(api huma.API, h *Attachments, access handlers.ProjectAccessStore) {
	base := "/api/v1/projects/{project_id}/attachments"
	for _, route := range []struct{ method, path, id, summary string }{
		{http.MethodPost, base, "upload-attachment", "Upload one multipart file (field file), up to 10 MiB; PDF, PNG, JPEG, GIF, WebP or plain text"},
		{http.MethodGet, base, "list-attachments", "List project attachments"},
		{http.MethodGet, base + "/{attachment_id}", "download-attachment", "Download an attachment"},
		{http.MethodDelete, base + "/{attachment_id}", "delete-attachment", "Delete an attachment"},
	} {
		op := huma.Operation{Method: route.method, Path: route.path, OperationID: route.id, Summary: route.summary, Security: []map[string][]string{{"bearer": {}}},
			Parameters: []*huma.Param{{Name: "project_id", In: "path", Required: true, Schema: &huma.Schema{Type: "string", Format: "uuid"}}},
			Responses:  map[string]*huma.Response{"400": {Description: "Invalid request"}, "401": {Description: "Authentication required"}, "422": {Description: "Invalid project ID"}, "404": {Description: "Not found"}, "503": {Description: "Database or storage unavailable"}},
		}
		schema := api.OpenAPI().Components.Schemas.Schema(reflect.TypeOf(attachmentMetadata{}), true, "Attachment")
		if strings.Contains(route.path, "{attachment_id}") {
			op.Parameters = append(op.Parameters, &huma.Param{Name: "attachment_id", In: "path", Required: true, Schema: &huma.Schema{Type: "string", Format: "uuid"}})
		}
		switch route.id {
		case "upload-attachment":
			op.RequestBody = &huma.RequestBody{Required: true, Content: map[string]*huma.MediaType{"multipart/form-data": {Schema: &huma.Schema{Type: "object", Required: []string{"file"}, Properties: map[string]*huma.Schema{"file": {Type: "string", Format: "binary"}}}}}}
			op.Responses["201"] = &huma.Response{Description: "Created", Content: map[string]*huma.MediaType{"application/json": {Schema: schema}}}
			op.Responses["413"] = &huma.Response{Description: "File exceeds 10 MiB"}
			op.Responses["415"] = &huma.Response{Description: "Unsupported file type"}
		case "list-attachments":
			op.Parameters = append(op.Parameters, &huma.Param{Name: "limit", In: "query", Schema: &huma.Schema{Type: "integer", Default: 100}}, &huma.Param{Name: "offset", In: "query", Schema: &huma.Schema{Type: "integer", Default: 0}})
			op.Responses["200"] = &huma.Response{Description: "Attachments (limit 1–100, offset >= 0)", Content: map[string]*huma.MediaType{"application/json": {Schema: &huma.Schema{Type: "array", Items: schema}}}}
		case "download-attachment":
			op.Parameters = append(op.Parameters, &huma.Param{Name: "If-None-Match", In: "header", Schema: &huma.Schema{Type: "string"}})
			op.Responses["200"] = &huma.Response{Description: "File bytes; ETag is quoted SHA-256; Cache-Control: private, no-cache", Content: map[string]*huma.MediaType{"application/octet-stream": {Schema: &huma.Schema{Type: "string", Format: "binary"}}}}
			op.Responses["304"] = &huma.Response{Description: "Unchanged; authorization revalidated"}
		case "delete-attachment":
			op.Responses["204"] = &huma.Response{Description: "Deleted"}
			op.Responses["202"] = &huma.Response{Description: "Deletion accepted; attachment is hidden and cleanup will retry automatically"}
		}
		permission := handlers.PermRead
		if route.method == http.MethodPost || route.method == http.MethodDelete {
			permission = handlers.PermEdit
		}
		op.Responses["403"] = &huma.Response{Description: "Insufficient project role"}
		handlers.RegisterRaw(api, op, handlers.InProject(access, handlers.ScopeProject("project_id"), permission), func(ctx huma.Context) {
			r, w := humachi.Unwrap(ctx)
			h.serve(w, r, auth.UserFromContext(r.Context()).ID)
		})
	}
}

func attachmentError(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(huma.NewError(code, message)); err != nil {
		slog.Warn("write attachment error", "error", err)
	}
}
func attachmentJSON(w http.ResponseWriter, code int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("write attachment response", "error", err)
	}
}
func parseUUID(s string) (pgtype.UUID, error) {
	u, err := uuid.Parse(s)
	return pgtype.UUID{Bytes: u, Valid: err == nil}, err
}

func (h *Attachments) serve(w http.ResponseWriter, r *http.Request, userID string) {
	w.Header().Set("Cache-Control", "no-store")
	if h == nil {
		attachmentError(w, 503, "attachments unavailable")
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
	user, err := parseUUID(userID)
	if err != nil {
		attachmentError(w, 401, "authentication required")
		return
	}
	if r.Method == http.MethodPost {
		h.upload(w, r, project, user)
		return
	}
	if chi.URLParam(r, "attachment_id") == "" {
		limit, offset := int64(100), int64(0)
		for key, target := range map[string]*int64{"limit": &limit, "offset": &offset} {
			if s := r.URL.Query().Get(key); s != "" {
				v, e := strconv.ParseInt(s, 10, 32)
				if e != nil {
					attachmentError(w, 400, "invalid pagination")
					return
				}
				*target = v
			}
		}
		if limit < 1 || limit > 100 || offset < 0 {
			attachmentError(w, 400, "invalid pagination")
			return
		}
		rows, e := h.queries.ListAttachments(ctx, db.ListAttachmentsParams{ProjectID: project, Limit: int32(limit), Offset: int32(offset)})
		if e != nil {
			attachmentError(w, 503, "database unavailable")
			return
		}
		out := make([]attachmentMetadata, 0, len(rows))
		for _, a := range rows {
			out = append(out, metadata(a))
		}
		attachmentJSON(w, 200, out)
		return
	}
	id, err := parseUUID(chi.URLParam(r, "attachment_id"))
	if err != nil {
		attachmentError(w, 400, "invalid attachment ID")
		return
	}
	a, err := h.queries.GetAttachment(ctx, db.GetAttachmentParams{ProjectID: project, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		attachmentError(w, 404, "not found")
		return
	}
	if err != nil {
		attachmentError(w, 503, "database unavailable")
		return
	}
	key := uuid.UUID(a.S3ObjectKey.Bytes).String()
	if r.Method == http.MethodDelete {
		// Persist intent before touching storage. Cleanup survives request/process failure.
		affected, err := h.queries.MarkAttachmentDeleting(ctx, db.MarkAttachmentDeletingParams{ProjectID: project, ID: id})
		if err != nil {
			attachmentError(w, 503, "database unavailable")
			return
		}
		if affected == 0 {
			attachmentError(w, 404, "not found")
			return
		}
		if err := h.finishDeletion(ctx, a); err != nil {
			slog.Warn("attachment deletion queued for retry", "id", uuid.UUID(id.Bytes).String(), "error", err)
			w.WriteHeader(http.StatusAccepted)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if a.DeletePending {
		attachmentError(w, 404, "not found")
		return
	}

	etag := `"` + a.Sha256 + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("Vary", "Authorization")
	for _, tag := range strings.Split(r.Header.Get("If-None-Match"), ",") {
		tag = strings.TrimSpace(tag)
		if tag == "*" || strings.TrimPrefix(tag, "W/") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	body, err := h.objects.Get(ctx, key)
	if err != nil {
		attachmentError(w, 503, "storage unavailable")
		return
	}
	defer func() {
		if err := body.Close(); err != nil {
			slog.Warn("close attachment stream", "error", err)
		}
	}()
	w.Header().Set("Content-Type", a.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(a.SizeBytes, 10))
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": a.FileName}))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if _, err = io.Copy(w, body); err != nil {
		slog.Warn("stream attachment", "error", err)
		panic(http.ErrAbortHandler)
	}
}

func (h *Attachments) upload(w http.ResponseWriter, r *http.Request, project, user pgtype.UUID) {
	r.Body = http.MaxBytesReader(w, r.Body, maxAttachmentSize+(64<<10))
	reader, err := r.MultipartReader()
	if err != nil {
		attachmentError(w, 400, "expected multipart/form-data")
		return
	}
	part, err := reader.NextPart()
	if err != nil {
		attachmentError(w, 400, "expected file field")
		return
	}
	name := part.FileName()
	if part.FormName() != "file" || name == "" || len(name) > 255 || strings.ContainsAny(name, `/\`) || strings.IndexFunc(name, unicode.IsControl) >= 0 || path.Base(name) != name {
		attachmentError(w, 400, "invalid file field or filename")
		return
	}
	if declared := part.Header.Get("Content-Type"); declared != "" {
		contentType, _, err := mime.ParseMediaType(declared)
		if err != nil || (contentType != "application/octet-stream" && !allowedAttachmentType(contentType)) {
			attachmentError(w, 415, "unsupported file type")
			return
		}
	}
	file, err := os.CreateTemp("", "taramisu-upload-*")
	if err != nil {
		attachmentError(w, 503, "upload buffer unavailable")
		return
	}
	defer func() { _ = file.Close(); _ = os.Remove(file.Name()) }()
	hash := sha256.New()
	n, err := io.Copy(io.MultiWriter(file, hash), io.LimitReader(part, maxAttachmentSize+1))
	var tooLarge *http.MaxBytesError
	if n > maxAttachmentSize || errors.As(err, &tooLarge) {
		attachmentError(w, 413, "file exceeds 10 MiB")
		return
	}
	if err != nil || n == 0 {
		attachmentError(w, 400, "empty or incomplete file")
		return
	}
	if _, err = reader.NextPart(); !errors.Is(err, io.EOF) {
		if errors.As(err, &tooLarge) {
			attachmentError(w, 413, "request too large")
		} else {
			attachmentError(w, 400, "expected exactly one file")
		}
		return
	}
	sample := make([]byte, 512)
	count, err := file.ReadAt(sample, 0)
	if err != nil && !errors.Is(err, io.EOF) {
		attachmentError(w, 503, "upload buffer unavailable")
		return
	}
	contentType := strings.Split(http.DetectContentType(sample[:count]), ";")[0]
	if !allowedAttachmentType(contentType) {
		attachmentError(w, 415, "unsupported file type")
		return
	}
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		attachmentError(w, 503, "upload buffer unavailable")
		return
	}
	key := uuid.New()
	cleanup := func(parent context.Context) {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), 10*time.Second)
		defer cancel()
		if e := h.objects.Delete(ctx, key.String()); e != nil {
			slog.Error("cleanup attachment object", "key", key.String(), "error", e)
		}
	}
	if err = h.objects.Put(r.Context(), key.String(), contentType, n, file); err != nil {
		cleanup(r.Context())
		attachmentError(w, 503, "storage unavailable")
		return
	}
	a, err := h.queries.CreateAttachment(r.Context(), db.CreateAttachmentParams{ProjectID: project, FileName: name, ContentType: contentType, SizeBytes: n, Sha256: hex.EncodeToString(hash.Sum(nil)), S3ObjectKey: pgtype.UUID{Bytes: key, Valid: true}, UploadedBy: user})
	if err != nil {
		cleanup(r.Context())
		attachmentError(w, 503, "database unavailable")
		return
	}
	w.Header().Set("Location", fmt.Sprintf("/api/v1/projects/%s/attachments/%s", uuid.UUID(project.Bytes), uuid.UUID(a.ID.Bytes)))
	attachmentJSON(w, 201, metadata(a))
}

func allowedAttachmentType(contentType string) bool {
	switch contentType {
	case "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain":
		return true
	default:
		return false
	}
}
