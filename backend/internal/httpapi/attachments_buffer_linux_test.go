//go:build linux

package httpapi

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

// A subprocess isolates the file-size limit from other tests. Creation succeeds,
// but writing the upload buffer fails, like a full filesystem.
func TestAttachmentBufferWriteFailure(t *testing.T) {
	if os.Getenv("ATTACHMENT_BUFFER_LIMIT_TEST") != "1" {
		cmd := exec.Command("/proc/self/exe", "-test.run=^TestAttachmentBufferWriteFailure$")
		cmd.Env = append(os.Environ(), "ATTACHMENT_BUFFER_LIMIT_TEST=1", "TMPDIR="+t.TempDir())
		output, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("buffer failure test: %v\n%s", err, output)
		}
		if !strings.Contains(string(output), "attachment upload buffer failed") {
			t.Fatalf("write failure was not logged: %s", output)
		}
		return
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "report.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = part.Write(bytes.Repeat([]byte("x"), 2048)); err != nil {
		t.Fatal(err)
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	signal.Ignore(syscall.SIGXFSZ)
	var original syscall.Rlimit
	if err = syscall.Getrlimit(syscall.RLIMIT_FSIZE, &original); err != nil {
		t.Fatal(err)
	}
	if err = syscall.Setrlimit(syscall.RLIMIT_FSIZE, &syscall.Rlimit{Cur: 1024, Max: original.Max}); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := syscall.Setrlimit(syscall.RLIMIT_FSIZE, &original); err != nil {
			t.Error(err)
		}
	}()
	request := httptest.NewRequest(http.MethodPost, "/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	(&Attachments{}).upload(response, request, pgtype.UUID{}, pgtype.UUID{})
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("got %d: %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "file too large") {
		t.Fatal("internal filesystem error exposed")
	}
}
