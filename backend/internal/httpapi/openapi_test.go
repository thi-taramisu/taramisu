package httpapi_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

func TestOpenAPIEndpointMatchesExport(t *testing.T) {
	spec := httpapi.OpenAPI()
	if spec.OpenAPI != "3.1.0" {
		t.Fatalf("openapi version = %q, want 3.1.0", spec.OpenAPI)
	}
	for _, path := range []string{"/health/live", "/health/ready"} {
		if spec.Paths[path] == nil {
			t.Fatalf("missing path %q in OpenAPI spec", path)
		}
	}

	exported, err := json.Marshal(spec)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	httpapi.New(nil, nil, nil).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/openapi.json", http.NoBody))
	if rr.Code != http.StatusOK {
		t.Fatalf("GET /openapi.json status = %d, want %d", rr.Code, http.StatusOK)
	}

	var fromHTTP, fromExport any
	if err := json.Unmarshal(rr.Body.Bytes(), &fromHTTP); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(exported, &fromExport); err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(fromHTTP, fromExport) {
		t.Fatal("GET /openapi.json body differs from httpapi.OpenAPI() JSON")
	}
}

func TestOpenAPIExportCLI(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	cmd := exec.Command("go", "run", "./cmd/openapi")
	cmd.Dir = filepath.Join(filepath.Dir(filename), "../..")
	cmd.Env = append(os.Environ(), "DATABASE_URL=")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go run ./cmd/openapi: %v\n%s", err, out)
	}

	want, err := openAPIText()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(out, want) {
		t.Fatal("cmd/openapi output differs from httpapi.OpenAPI()")
	}
}

func TestOpenAPIFreshness(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	committed, err := os.ReadFile(filepath.Join(filepath.Dir(filename), "../../openapi.json"))
	if err != nil {
		t.Fatal(err)
	}

	want, err := openAPIText()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(committed, want) {
		t.Fatal("backend/openapi.json is stale; run make openapi")
	}
}

func openAPIText() ([]byte, error) {
	data, err := json.MarshalIndent(httpapi.OpenAPI(), "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

func jsonEqual(a, b any) bool {
	ab, err := json.Marshal(a)
	if err != nil {
		return false
	}
	bb, err := json.Marshal(b)
	if err != nil {
		return false
	}
	return string(ab) == string(bb)
}
