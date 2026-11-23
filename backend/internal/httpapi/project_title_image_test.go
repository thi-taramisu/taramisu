package httpapi

import (
	"bytes"
	"context"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
)

// Runs inside the attachment suite's isolated PostgreSQL transaction and real
// SeaweedFS bucket, using the same authenticated routes as production.
func testProjectTitleImages(t *testing.T, mux http.Handler, fixture *authtest.Fixture, h *Attachments, objects *trackedObjects, project, owner, member string, exec func(string, ...any)) {
	t.Helper()
	base := "/api/v1/projects/" + project
	path := base + "/title-image"
	request := func(method, url, user string, data []byte) *httptest.ResponseRecorder {
		t.Helper()
		var body bytes.Buffer
		contentType := ""
		if data != nil {
			writer := multipart.NewWriter(&body)
			part, err := writer.CreateFormFile("file", "image.png")
			if err != nil {
				t.Fatal(err)
			}
			if _, err = part.Write(data); err != nil {
				t.Fatal(err)
			}
			if err = writer.Close(); err != nil {
				t.Fatal(err)
			}
			contentType = writer.FormDataContentType()
		}
		r := httptest.NewRequest(method, url, &body)
		r.Header.Set("Content-Type", contentType)
		if user != "" {
			r.Header.Set("Authorization", "Bearer "+fixture.Token(t, map[string]any{"sub": user}))
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	check := func(w *httptest.ResponseRecorder, status int) {
		t.Helper()
		if w.Code != status {
			t.Fatalf("got %d want %d: %s", w.Code, status, w.Body.String())
		}
	}
	var pngData, jpegData bytes.Buffer
	pixels := image.NewRGBA(image.Rect(0, 0, 2, 2))
	if err := png.Encode(&pngData, pixels); err != nil {
		t.Fatal(err)
	}
	if err := jpeg.Encode(&jpegData, pixels, nil); err != nil {
		t.Fatal(err)
	}
	data := pngData.Bytes()
	check(request("PUT", path, "", data), 401)
	check(request("PUT", path, member, data), 404)
	check(request("GET", path, owner, nil), 404)
	check(request("PUT", path, owner, nil), 400)
	check(request("PUT", path, owner, []byte("not an image")), 415)
	check(request("PUT", path, owner, data[:len(data)/2]), 415)
	check(request("PUT", path, owner, []byte{}), 400)
	check(request("PUT", path, owner, bytes.Repeat([]byte("x"), maxTitleImageSize+1)), 413)
	// A tiny file can claim enormous dimensions; reject it before decoding pixels.
	oversized := bytes.Clone(data)
	binary.BigEndian.PutUint32(oversized[16:20], 5000)
	binary.BigEndian.PutUint32(oversized[20:24], 4001)
	binary.BigEndian.PutUint32(oversized[29:33], crc32.ChecksumIEEE(oversized[12:29]))
	check(request("PUT", path, owner, oversized), 413)
	check(request("PUT", path, owner, data), 200)
	first := objects.key
	w := request("GET", path, owner, nil)
	check(w, 200)
	if !bytes.Equal(w.Body.Bytes(), data) || w.Header().Get("Content-Type") != "image/png" {
		t.Fatal("image bytes or media type changed")
	}
	for _, target := range []string{base, "/api/v1/projects"} {
		w := request("GET", target, owner, nil)
		check(w, 200)
		if !strings.Contains(w.Body.String(), `"title_image_url":"`+path+`"`) {
			t.Fatalf("missing image URL: %s", w.Body.String())
		}
	}
	exec("INSERT INTO project_role_assignment(tara_project_id,user_id,project_role) VALUES($1,$2,'VIEWER')", project, member)
	check(request("GET", path, member, nil), 200)
	check(request("PUT", path, member, data), 403)
	check(request("DELETE", path, member, nil), 403)
	exec("UPDATE project_role_assignment SET project_role='EDITOR' WHERE tara_project_id=$1 AND user_id=$2", project, member)
	check(request("PUT", path, member, data), 403)
	check(request("DELETE", path, member, nil), 403)
	objects.failPut = true
	check(request("PUT", path, owner, jpegData.Bytes()), 503)
	objects.failPut = false
	check(request("GET", path, owner, nil), 200)
	// Replacement commits even during a storage delete outage; retry survives a new handler.
	objects.failDelete = true
	check(request("PUT", path, owner, jpegData.Bytes()), 200)
	second := objects.key
	if second == first {
		t.Fatal("replacement reused object key")
	}
	objects.failDelete = false
	if err := NewAttachments(h.queries, objects).cleanupTitleImages(context.Background()); err != nil {
		t.Fatal(err)
	}
	if stream, err := objects.Get(context.Background(), first); err == nil {
		_ = stream.Close()
		t.Fatal("old object survived cleanup")
	}
	w = request("GET", path, member, nil)
	check(w, 200)
	if w.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatal("replacement not returned")
	}
	objects.failGet = true
	check(request("GET", path, owner, nil), 503)
	objects.failGet = false
	check(request("DELETE", path, owner, nil), 204)
	check(request("DELETE", path, owner, nil), 204)
	check(request("GET", path, owner, nil), 404)
	if stream, err := objects.Get(context.Background(), second); err == nil {
		_ = stream.Close()
		t.Fatal("removed object survived cleanup")
	}
	check(request("PUT", path, owner, data), 200)
	last := objects.key
	check(request("DELETE", base, owner, nil), 204)
	if err := h.cleanupTitleImages(context.Background()); err != nil {
		t.Fatal(err)
	}
	if stream, err := objects.Get(context.Background(), last); err == nil {
		_ = stream.Close()
		t.Fatal("deleted project's object survived cleanup")
	}
}
