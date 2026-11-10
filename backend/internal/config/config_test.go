package config

import (
	"strings"
	"testing"
	"time"

	"github.com/thi-taramisu/taramisu/backend/internal/auth"
)

func clearOIDCEnv(t *testing.T) {
	t.Helper()
	storageEnv(t)
	t.Setenv("OIDC_ISSUER", "")
	t.Setenv("OIDC_CLIENT_ID", "")
	t.Setenv("OIDC_JWKS_URL", "")
	t.Setenv("AUTHENTIK_API_URL", "")
	t.Setenv("AUTHENTIK_API_TOKEN", "")
	t.Setenv("IAM_USER_CACHE_TTL", "")
	t.Setenv("AUTHENTIK_METADATA_CACHE_TTL", "")
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
	t.Setenv("AUTHENTIK_API_URL", "http://authentik-server:9000/auth")
	t.Setenv("AUTHENTIK_API_TOKEN", "service-token")

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
	if cfg.IAMUserCacheTTL != 10*time.Minute {
		t.Errorf("IAMUserCacheTTL = %v, want 10m", cfg.IAMUserCacheTTL)
	}
	if cfg.AuthentikMetadataCacheTTL != 5*time.Minute {
		t.Errorf("AuthentikMetadataCacheTTL = %v, want 5m", cfg.AuthentikMetadataCacheTTL)
	}
}

func TestLoadDocumentedIAMEnvironmentAndCustomTTLs(t *testing.T) {
	clearOIDCEnv(t)
	t.Setenv("DATABASE_URL", "postgres://user@localhost:5432/taramisu")
	t.Setenv("AUTHENTIK_API_URL", "http://authentik-server:9000/auth")
	t.Setenv("AUTHENTIK_API_TOKEN", "api-token-xyz")
	t.Setenv("IAM_USER_CACHE_TTL", "15m")
	t.Setenv("AUTHENTIK_METADATA_CACHE_TTL", "30s")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.AuthentikURL != "http://authentik-server:9000/auth" {
		t.Errorf("AuthentikURL = %q, want http://authentik-server:9000/auth", cfg.AuthentikURL)
	}
	if cfg.AuthentikToken != "api-token-xyz" {
		t.Errorf("AuthentikToken = %q, want api-token-xyz", cfg.AuthentikToken)
	}
	if cfg.IAMUserCacheTTL != 15*time.Minute {
		t.Errorf("IAMUserCacheTTL = %v, want 15m", cfg.IAMUserCacheTTL)
	}
	if cfg.AuthentikMetadataCacheTTL != 30*time.Second {
		t.Errorf("AuthentikMetadataCacheTTL = %v, want 30s", cfg.AuthentikMetadataCacheTTL)
	}

	// Verify that DirectoryResolver can be configured through the returned config
	resolver, err := auth.NewDirectoryResolver(auth.DirectoryConfig{
		BaseURL: cfg.AuthentikURL,
		Token:   cfg.AuthentikToken,
		TTL:     cfg.AuthentikMetadataCacheTTL,
	})
	if err != nil {
		t.Fatalf("NewDirectoryResolver() error = %v", err)
	}
	if resolver == nil {
		t.Fatal("expected resolver to be initialized")
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
		name                      string
		httpAddr                  string
		databaseURL               string
		oidcIssuer                string
		oidcJWKSURL               string
		authentikAPIURL           string
		iamUserCacheTTL           string
		authentikMetadataCacheTTL string
		wantError                 string
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
			name:            "invalid Authentik API URL",
			databaseURL:     "postgres://user@localhost/taramisu",
			authentikAPIURL: "http://user@localhost/auth",
			wantError:       "invalid AUTHENTIK_API_URL",
		},
		{
			name:            "unparseable IAM user cache TTL",
			databaseURL:     "postgres://user@localhost/taramisu",
			iamUserCacheTTL: "not-a-duration",
			wantError:       "invalid IAM_USER_CACHE_TTL",
		},
		{
			name:            "negative IAM user cache TTL",
			databaseURL:     "postgres://user@localhost/taramisu",
			iamUserCacheTTL: "-1m",
			wantError:       "invalid IAM_USER_CACHE_TTL",
		},
		{
			name:            "zero IAM user cache TTL",
			databaseURL:     "postgres://user@localhost/taramisu",
			iamUserCacheTTL: "0s",
			wantError:       "invalid IAM_USER_CACHE_TTL",
		},
		{
			name:                      "unparseable Authentik metadata cache TTL",
			databaseURL:               "postgres://user@localhost/taramisu",
			authentikMetadataCacheTTL: "invalid",
			wantError:                 "invalid AUTHENTIK_METADATA_CACHE_TTL",
		},
		{
			name:                      "negative Authentik metadata cache TTL",
			databaseURL:               "postgres://user@localhost/taramisu",
			authentikMetadataCacheTTL: "-30s",
			wantError:                 "invalid AUTHENTIK_METADATA_CACHE_TTL",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clearOIDCEnv(t)
			t.Setenv("HTTP_ADDR", tt.httpAddr)
			t.Setenv("DATABASE_URL", tt.databaseURL)
			t.Setenv("OIDC_ISSUER", tt.oidcIssuer)
			t.Setenv("OIDC_JWKS_URL", tt.oidcJWKSURL)
			t.Setenv("AUTHENTIK_API_URL", tt.authentikAPIURL)
			t.Setenv("IAM_USER_CACHE_TTL", tt.iamUserCacheTTL)
			t.Setenv("AUTHENTIK_METADATA_CACHE_TTL", tt.authentikMetadataCacheTTL)

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
