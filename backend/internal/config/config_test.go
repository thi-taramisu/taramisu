package config

import (
	"strings"
	"testing"
)

func TestLoadDefaultsHTTPAddr(t *testing.T) {
	storageEnv(t)
	t.Setenv("HTTP_ADDR", "")
	t.Setenv("DATABASE_URL", "postgres://user@localhost:5432/taramisu")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.HTTPAddr != defaultHTTPAddr {
		t.Errorf("HTTPAddr = %q, want %q", cfg.HTTPAddr, defaultHTTPAddr)
	}
}

func TestLoadValidEnvironment(t *testing.T) {
	storageEnv(t)
	t.Setenv("HTTP_ADDR", "127.0.0.1:9090")
	t.Setenv("DATABASE_URL", "postgresql://user@db.example.com:5432/taramisu?sslmode=disable")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.HTTPAddr != "127.0.0.1:9090" {
		t.Errorf("HTTPAddr = %q", cfg.HTTPAddr)
	}
	if cfg.DatabaseURL != "postgresql://user@db.example.com:5432/taramisu?sslmode=disable" {
		t.Errorf("DatabaseURL = %q", cfg.DatabaseURL)
	}
}

func TestLoadFailures(t *testing.T) {
	tests := []struct {
		name        string
		httpAddr    string
		databaseURL string
		wantError   string
	}{
		{
			name:      "missing database URL",
			wantError: "DATABASE_URL is required",
		},
		{
			name:        "invalid HTTP address",
			httpAddr:    "not-an-address",
			databaseURL: "postgres://user@localhost/taramisu",
			wantError:   "invalid HTTP_ADDR",
		},
		{
			name:        "out of range HTTP port",
			httpAddr:    ":70000",
			databaseURL: "postgres://user@localhost/taramisu",
			wantError:   "invalid HTTP_ADDR",
		},
		{
			name:        "malformed database URL",
			databaseURL: "postgres://user%zz@localhost/taramisu",
			wantError:   "invalid DATABASE_URL",
		},
		{
			name:        "invalid database URL",
			databaseURL: "mysql://user@localhost/taramisu",
			wantError:   "invalid DATABASE_URL",
		},
		{
			name:        "missing database host",
			databaseURL: "postgres:///taramisu",
			wantError:   "invalid DATABASE_URL",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("HTTP_ADDR", tt.httpAddr)
			t.Setenv("DATABASE_URL", tt.databaseURL)

			_, err := Load()
			if err == nil {
				t.Fatal("Load() error = nil, want error")
			}
			if got := err.Error(); !strings.Contains(got, tt.wantError) {
				t.Errorf("Load() error = %q, want it to contain %q", got, tt.wantError)
			}
		})
	}
}

func storageEnv(t *testing.T) {
	t.Helper()
	t.Setenv("S3_ENDPOINT", "http://storage:8333")
	t.Setenv("S3_BUCKET", "taramisu-uploads")
	t.Setenv("S3_ACCESS_KEY", "test-backend")
	t.Setenv("S3_SECRET_KEY", "test-secret")
	t.Setenv("S3_REGION", "")
}

func TestS3Config(t *testing.T) {
	storageEnv(t)
	cfg, err := loadS3()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Endpoint != "http://storage:8333" || cfg.Region != "us-east-1" || cfg.Bucket != "taramisu-uploads" || cfg.AccessKey != "test-backend" || cfg.SecretKey != "test-secret" || !cfg.UsePathStyle {
		t.Fatal("incorrect S3 configuration")
	}
	for _, key := range []string{"S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"} {
		t.Run(key, func(t *testing.T) {
			t.Setenv(key, "")
			if _, err := loadS3(); err == nil || !strings.Contains(err.Error(), key) {
				t.Fatal("missing field accepted")
			}
		})
	}
	for _, endpoint := range []string{"ftp://storage", "http:///", "http://user:secret@storage", "http://storage/bucket", "http://storage?secret=value", "http://storage/#fragment", "http://%zz"} {
		t.Run(endpoint, func(t *testing.T) {
			t.Setenv("S3_ENDPOINT", endpoint)
			if _, err := loadS3(); err == nil || strings.Contains(err.Error(), "secret") {
				t.Fatal("invalid endpoint accepted or leaked")
			}
		})
	}
	t.Setenv("S3_BUCKET", "bad:bucket*")
	if _, err := loadS3(); err == nil {
		t.Fatal("invalid bucket accepted")
	}
}
