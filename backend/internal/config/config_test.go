package config

import (
	"strings"
	"testing"
)

func clearOIDCEnv(t *testing.T) {
	t.Helper()
	t.Setenv("OIDC_ISSUER", "")
	t.Setenv("OIDC_CLIENT_ID", "")
	t.Setenv("OIDC_JWKS_URL", "")
	t.Setenv("AUTHENTIK_URL", "")
	t.Setenv("AUTHENTIK_TOKEN", "")
}

func TestLoadDefaultsHTTPAddr(t *testing.T) {
	clearOIDCEnv(t)
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
	clearOIDCEnv(t)
	t.Setenv("HTTP_ADDR", "127.0.0.1:9090")
	t.Setenv("DATABASE_URL", "postgresql://user@db.example.com:5432/taramisu?sslmode=disable")
	t.Setenv("OIDC_ISSUER", "http://localhost/auth/application/o/taramisu/")
	t.Setenv("OIDC_CLIENT_ID", "taramisu")
	t.Setenv("AUTHENTIK_URL", "http://authentik-server:9000/auth")
	t.Setenv("AUTHENTIK_TOKEN", "service-token")

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
	if cfg.OIDCIssuer != "http://localhost/auth/application/o/taramisu/" {
		t.Errorf("OIDCIssuer = %q", cfg.OIDCIssuer)
	}
	if cfg.OIDCClientID != "taramisu" {
		t.Errorf("OIDCClientID = %q", cfg.OIDCClientID)
	}
	if cfg.OIDCJWKSURL != "http://localhost/auth/application/o/taramisu/jwks/" {
		t.Errorf("OIDCJWKSURL = %q", cfg.OIDCJWKSURL)
	}
	if cfg.AuthentikURL != "http://authentik-server:9000/auth" {
		t.Errorf("AuthentikURL = %q", cfg.AuthentikURL)
	}
	if cfg.AuthentikToken != "service-token" {
		t.Errorf("AuthentikToken = %q", cfg.AuthentikToken)
	}
}

func TestLoadExplicitJWKSURL(t *testing.T) {
	clearOIDCEnv(t)
	t.Setenv("DATABASE_URL", "postgres://user@localhost:5432/taramisu")
	t.Setenv("OIDC_ISSUER", "http://localhost/auth/application/o/taramisu/")
	t.Setenv("OIDC_JWKS_URL", "http://authentik-server:9000/auth/application/o/taramisu/jwks/")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.OIDCJWKSURL != "http://authentik-server:9000/auth/application/o/taramisu/jwks/" {
		t.Errorf("OIDCJWKSURL = %q", cfg.OIDCJWKSURL)
	}
}

func TestLoadFailures(t *testing.T) {
	tests := []struct {
		name         string
		httpAddr     string
		databaseURL  string
		oidcIssuer   string
		oidcJWKSURL  string
		authentikURL string
		wantError    string
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
		{
			name:        "malformed OIDC issuer URL",
			databaseURL: "postgres://user@localhost/taramisu",
			oidcIssuer:  "http://%zz",
			wantError:   "invalid OIDC_ISSUER",
		},
		{
			name:        "invalid OIDC issuer scheme",
			databaseURL: "postgres://user@localhost/taramisu",
			oidcIssuer:  "ftp://localhost/auth",
			wantError:   "invalid OIDC_ISSUER",
		},
		{
			name:        "missing OIDC issuer host",
			databaseURL: "postgres://user@localhost/taramisu",
			oidcIssuer:  "http:///auth",
			wantError:   "invalid OIDC_ISSUER",
		},
		{
			name:        "OIDC issuer with query",
			databaseURL: "postgres://user@localhost/taramisu",
			oidcIssuer:  "http://localhost/auth?foo=bar",
			wantError:   "invalid OIDC_ISSUER",
		},
		{
			name:        "invalid OIDC JWKS URL",
			databaseURL: "postgres://user@localhost/taramisu",
			oidcJWKSURL: "://bad-url",
			wantError:   "invalid OIDC_JWKS_URL",
		},
		{
			name:         "invalid Authentik URL",
			databaseURL:  "postgres://user@localhost/taramisu",
			authentikURL: "http://user@localhost/auth",
			wantError:    "invalid AUTHENTIK_URL",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clearOIDCEnv(t)
			t.Setenv("HTTP_ADDR", tt.httpAddr)
			t.Setenv("DATABASE_URL", tt.databaseURL)
			t.Setenv("OIDC_ISSUER", tt.oidcIssuer)
			t.Setenv("OIDC_JWKS_URL", tt.oidcJWKSURL)
			t.Setenv("AUTHENTIK_URL", tt.authentikURL)

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
