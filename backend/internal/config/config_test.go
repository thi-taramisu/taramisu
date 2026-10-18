package config

import (
	"strings"
	"testing"
)

func TestLoadDefaultsHTTPAddr(t *testing.T) {
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
			name:        "invalid database URL",
			databaseURL: "mysql://user@localhost/taramisu",
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
