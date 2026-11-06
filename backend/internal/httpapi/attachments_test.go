package httpapi

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/config"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/storage"
)

// Run against an isolated, migrated database and SeaweedFS with TEST_DATABASE_URL
// and TEST_S3_ENDPOINT/ACCESS_KEY/SECRET_KEY. Each test rolls back its metadata.
func TestAttachmentsIntegration(t *testing.T) {
	for _, key := range []string{"TEST_DATABASE_URL", "TEST_S3_ENDPOINT", "TEST_S3_ACCESS_KEY", "TEST_S3_SECRET_KEY"} {
		if os.Getenv(key) == "" {
			if os.Getenv("CI") != "" {
				t.Fatalf("%s is required in CI", key)
			}
			t.Skip("requires PostgreSQL and S3 test settings")
		}
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	cfg := config.S3Config{Endpoint: os.Getenv("TEST_S3_ENDPOINT"), Region: "us-east-1", Bucket: "test-" + uuid.NewString(), AccessKey: os.Getenv("TEST_S3_ACCESS_KEY"), SecretKey: os.Getenv("TEST_S3_SECRET_KEY"), UsePathStyle: true}
	client := s3.New(s3.Options{BaseEndpoint: &cfg.Endpoint, Region: cfg.Region, UsePathStyle: true, Credentials: credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, "")})
	if _, err = client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: &cfg.Bucket}); err != nil {
		t.Fatal(err)
	}
	defer func() {
		out, e := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: &cfg.Bucket})
		if e != nil {
			t.Error(e)
			return
		}
		for _, o := range out.Contents {
			if _, e = client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: &cfg.Bucket, Key: o.Key}); e != nil {
				t.Error(e)
			}
		}
		if _, e = client.DeleteBucket(ctx, &s3.DeleteBucketInput{Bucket: &cfg.Bucket}); e != nil {
			t.Error(e)
		}
	}()
	objects := storage.New(cfg)
	for _, scenario := range []string{"flow", "insert-failure", "put-failure", "cancelled-upload"} {
		t.Run(scenario, func(t *testing.T) {
			tx, e := pool.Begin(ctx)
			if e != nil {
				t.Fatal(e)
			}
			defer func() { _ = tx.Rollback(ctx) }()
			exec := func(sql string, args ...any) {
				t.Helper()
				if _, e := tx.Exec(ctx, sql, args...); e != nil {
					t.Fatal(e)
				}
			}
			project, user, other, group := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
			exec("INSERT INTO tara_project(id,name) VALUES($1,'attachments test')", project)
			exec("INSERT INTO iam_user(id,external_iam_sub) VALUES($1,$1::uuid::text),($2,$2::uuid::text)", user, other)
			exec("INSERT INTO project_role_assignment(tara_project_id,user_id,project_role) VALUES($1,$2,'OWNER')", project, user)
			tracked := &trackedObjects{ObjectStore: objects}
			h := NewAttachments(db.New(tx), tracked)
			base := "/api/v1/projects/" + project + "/attachments"
			request := func(method, target, who string, data []byte, etag string) *httptest.ResponseRecorder {
				t.Helper()
				var body io.Reader = http.NoBody
				contentType := ""
				if data != nil {
					var b bytes.Buffer
					m := multipart.NewWriter(&b)
					part, e := m.CreateFormFile("file", "report.txt")
					if e != nil {
						t.Fatal(e)
					}
					if _, e = part.Write(data); e != nil {
						t.Fatal(e)
					}
					if e = m.Close(); e != nil {
						t.Fatal(e)
					}
					body = &b
					contentType = m.FormDataContentType()
				}
				requestCtx, cancel := context.WithCancel(ctx)
				defer cancel()
				if scenario == "cancelled-upload" {
					tracked.afterPut = cancel
				}
				r := httptest.NewRequestWithContext(requestCtx, method, target, body)
				r.Header.Set("Content-Type", contentType)
				r.Header.Set("If-None-Match", etag)
				mux := chi.NewRouter()
				mux.HandleFunc("/api/v1/projects/{project_id}/attachments", func(w http.ResponseWriter, r *http.Request) { h.serve(w, r, who) })
				mux.HandleFunc("/api/v1/projects/{project_id}/attachments/{attachment_id}", func(w http.ResponseWriter, r *http.Request) { h.serve(w, r, who) })
				w := httptest.NewRecorder()
				mux.ServeHTTP(w, r)
				return w
			}
			check := func(w *httptest.ResponseRecorder, code int) {
				t.Helper()
				if w.Code != code {
					t.Fatalf("got %d want %d: %s", w.Code, code, w.Body.String())
				}
			}
			data := []byte("attachment content\n")
			if scenario != "flow" {
				if scenario == "insert-failure" {
					tracked.afterPut = func() { _ = tx.Rollback(ctx) }
				}
				tracked.failPut = scenario == "put-failure"
				check(request("POST", base, user, data, ""), 503)
				if tracked.key == "" || tracked.deletes != 1 {
					t.Fatal("failed insert did not clean up object")
				}
				if body, e := objects.Get(ctx, tracked.key); e == nil {
					_ = body.Close()
					t.Fatal("orphaned object")
				}
				return
			}
			check(request("GET", base, "", nil, ""), 401)
			check(request("POST", base, other, data, ""), 404)
			check(request("GET", base, other, nil, ""), 404)
			check(request("GET", base+"?limit=101", user, nil, ""), 400)
			check(request("GET", base+"?offset=-1", user, nil, ""), 400)
			check(request("GET", base+"?limit=abc", user, nil, ""), 400)
			check(request("GET", "/api/v1/projects/not-a-uuid/attachments", user, nil, ""), 400)
			check(request("GET", base+"/not-a-uuid", user, nil, ""), 400)
			check(request("GET", base+"/"+uuid.NewString(), user, nil, ""), 404)
			check(request("POST", base, user, []byte{}, ""), 400)
			check(request("POST", base, user, []byte("<html>unsafe</html>"), ""), 415)
			check(request("POST", base, user, bytes.Repeat([]byte("x"), maxAttachmentSize+1), ""), 413)
			if tracked.key != "" {
				t.Fatal("invalid uploads reached storage")
			}
			w := request("POST", base, user, data, "")
			check(w, 201)
			location := w.Header().Get("Location")
			var meta attachmentMetadata
			if e = json.Unmarshal(w.Body.Bytes(), &meta); e != nil {
				t.Fatal(e)
			}
			hash := sha256.Sum256(data)
			if meta.SHA256 != hex.EncodeToString(hash[:]) || meta.SizeBytes != int64(len(data)) {
				t.Fatal("incorrect metadata")
			}
			if _, e = uuid.Parse(tracked.key); e != nil {
				t.Fatal("object key is not a UUID")
			}
			if strings.Contains(w.Body.String(), tracked.key) {
				t.Fatal("storage key exposed")
			}
			w = request("GET", location, user, nil, "")
			check(w, 200)
			if !bytes.Equal(w.Body.Bytes(), data) || w.Header().Get("Cache-Control") != "private, no-cache" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("incorrect download")
			}
			etag := w.Header().Get("ETag")
			if w.Header().Get("Content-Disposition") != "attachment; filename=report.txt" {
				t.Fatal("unsafe download disposition")
			}
			check(request("GET", location, user, nil, `"different"`), 200)
			listed := request("GET", base+"?limit=1", user, nil, "")
			check(listed, 200)
			var entries []attachmentMetadata
			if e = json.Unmarshal(listed.Body.Bytes(), &entries); e != nil || len(entries) != 1 || entries[0].ID != meta.ID {
				t.Fatalf("incorrect listing: %s %v", listed.Body.String(), e)
			}
			listed = request("GET", base+"?offset=1", user, nil, "")
			check(listed, 200)
			if listed.Body.String() != "[]\n" {
				t.Fatal("incorrect pagination")
			}
			tracked.failGet = true
			check(request("GET", location, user, nil, ""), 503)
			tracked.failGet = false
			for _, tag := range []string{etag, "W/" + etag, `"other", ` + etag, "*"} {
				w = request("GET", location, user, nil, tag)
				check(w, 304)
				if w.Body.Len() != 0 {
					t.Fatal("304 has body")
				}
			}
			check(request("GET", strings.Replace(location, project, uuid.NewString(), 1), user, nil, ""), 404)
			for _, role := range []string{"VIEWER", "REVIEWER", "EDITOR", "OWNER"} {
				exec("UPDATE project_role_assignment SET project_role=$1 WHERE tara_project_id=$2", role, project)
				check(request("GET", location, user, nil, ""), 200)
				check(request("GET", base, user, nil, ""), 200)
				if role == "VIEWER" || role == "REVIEWER" {
					check(request("POST", base, user, data, ""), 404)
				} else {
					created := request("POST", base, user, data, "")
					check(created, 201)
				}
			}
			exec("DELETE FROM project_role_assignment WHERE tara_project_id=$1", project)
			check(request("GET", location, user, nil, etag), 404)
			exec("INSERT INTO iam_group(id,external_iam_group_id) VALUES($1,$1::uuid::text)", group)
			exec("INSERT INTO iam_user_group_member(user_id,group_id) VALUES($1,$2)", user, group)
			exec("INSERT INTO project_role_assignment(tara_project_id,group_id,project_role) VALUES($1,$2,'EDITOR')", project, group)
			check(request("GET", location, user, nil, ""), 200)
			// Pending metadata must never be served, including conditional downloads.
			exec("UPDATE attachment SET delete_pending=true WHERE id=$1", meta.ID)
			check(request("GET", location, user, nil, etag), 404)
			listed = request("GET", base, user, nil, "")
			check(listed, 200)
			if strings.Contains(listed.Body.String(), meta.ID) {
				t.Fatal("pending attachment was listed")
			}

		})
	}
}

type trackedObjects struct {
	ObjectStore
	key      string
	deletes  int
	failPut  bool
	failGet  bool
	afterPut func()
}

func (s *trackedObjects) Put(ctx context.Context, key, kind string, size int64, r io.ReadSeeker) error {
	s.key = key
	err := s.ObjectStore.Put(ctx, key, kind, size, r)
	if err == nil && s.afterPut != nil {
		s.afterPut()
	}
	if err == nil && s.failPut {
		return errors.New("injected failed PUT response")
	}
	return err
}
func (s *trackedObjects) Delete(ctx context.Context, key string) error {
	s.deletes++
	return s.ObjectStore.Delete(ctx, key)
}

func (s *trackedObjects) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	if s.failGet {
		return nil, errors.New("injected storage outage")
	}
	return s.ObjectStore.Get(ctx, key)
}

func TestRejectMalformedAttachmentUploads(t *testing.T) {
	temp := t.TempDir()
	t.Setenv("TMPDIR", temp)
	for _, test := range []struct {
		name, field, filename string
		parts                 int
		truncate              bool
	}{
		{"wrong field", "other", "file.txt", 1, false},
		{"no filename", "file", "", 1, false},
		{"multiple files", "file", "file.txt", 2, false},
		{"truncated body", "file", "file.txt", 1, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			var b bytes.Buffer
			writer := multipart.NewWriter(&b)
			for range test.parts {
				part, err := writer.CreateFormFile(test.field, test.filename)
				if err != nil {
					t.Fatal(err)
				}
				if _, err = part.Write([]byte("hello")); err != nil {
					t.Fatal(err)
				}
			}
			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}
			body := b.Bytes()
			if test.truncate {
				body = body[:len(body)-10]
			}
			r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
			r.Header.Set("Content-Type", writer.FormDataContentType())
			w := httptest.NewRecorder()
			(&Attachments{}).upload(w, r, pgtype.UUID{}, pgtype.UUID{})
			if w.Code != 400 {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
		})
	}
	for _, contentType := range []string{"application/json", "multipart/form-data; boundary=missing"} {
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("not multipart"))
		r.Header.Set("Content-Type", contentType)
		w := httptest.NewRecorder()
		(&Attachments{}).upload(w, r, pgtype.UUID{}, pgtype.UUID{})
		if w.Code != 400 {
			t.Fatalf("got %d for %s", w.Code, contentType)
		}
	}
	files, err := os.ReadDir(temp)
	if err != nil || len(files) != 0 {
		t.Fatalf("upload buffers leaked: %v %v", files, err)
	}
}

func TestRejectUnsupportedDeclaredAttachmentType(t *testing.T) {
	for _, declared := range []string{"image/svg+xml", "application/json", "invalid content type"} {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", `form-data; name="file"; filename="file.txt"`)
		header.Set("Content-Type", declared)
		part, err := writer.CreatePart(header)
		if err != nil {
			t.Fatal(err)
		}
		// Go's sniffer classifies this SVG as text/plain; the declared type must still be rejected.
		if _, err = part.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)); err != nil {
			t.Fatal(err)
		}
		if err = writer.Close(); err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest(http.MethodPost, "/", &body)
		r.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()
		(&Attachments{}).upload(w, r, pgtype.UUID{}, pgtype.UUID{})
		if w.Code != http.StatusUnsupportedMediaType {
			t.Fatalf("%s: got %d", declared, w.Code)
		}
	}
}
