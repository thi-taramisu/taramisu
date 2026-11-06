package config

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
)

const defaultHTTPAddr = ":8080"

// Config contains the runtime configuration for the API.
type Config struct {
	HTTPAddr    string
	DatabaseURL string
	S3          S3Config
}

// S3Config holds S3 settings.
type S3Config struct {
	Endpoint     string
	Region       string
	Bucket       string
	AccessKey    string
	SecretKey    string
	UsePathStyle bool
}

// Load reads and validates the runtime configuration from the environment.
func Load() (Config, error) {
	httpAddr := os.Getenv("HTTP_ADDR")
	if httpAddr == "" {
		httpAddr = defaultHTTPAddr
	}
	if err := validateHTTPAddr(httpAddr); err != nil {
		return Config{}, fmt.Errorf("invalid HTTP_ADDR: %w", err)
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if err := validateDatabaseURL(databaseURL); err != nil {
		return Config{}, fmt.Errorf("invalid DATABASE_URL: %w", err)
	}

	s3, err := loadS3()
	if err != nil {
		return Config{}, err
	}
	return Config{
		S3:          s3,
		HTTPAddr:    httpAddr,
		DatabaseURL: databaseURL,
	}, nil
}

func validateHTTPAddr(addr string) error {
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("must be a valid host:port address: %w", err)
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 0 || portNumber > 65535 {
		return fmt.Errorf("port %q must be between 0 and 65535", port)
	}
	return nil
}

func validateDatabaseURL(rawURL string) error {
	databaseURL, err := url.Parse(rawURL)
	if err != nil {
		var urlErr *url.Error
		if errors.As(err, &urlErr) {
			return urlErr.Err
		}
		return errors.New("must be a valid URL")
	}
	if databaseURL.Scheme != "postgres" && databaseURL.Scheme != "postgresql" {
		return errors.New("scheme must be postgres or postgresql")
	}
	if databaseURL.Hostname() == "" {
		return errors.New("host is required")
	}
	return nil
}

func loadS3() (S3Config, error) {
	cfg := S3Config{Endpoint: os.Getenv("S3_ENDPOINT"), Region: os.Getenv("S3_REGION"), Bucket: os.Getenv("S3_BUCKET"), AccessKey: os.Getenv("S3_ACCESS_KEY"), SecretKey: os.Getenv("S3_SECRET_KEY"), UsePathStyle: true}
	for _, field := range []struct{ name, value string }{
		{"S3_ENDPOINT", cfg.Endpoint}, {"S3_BUCKET", cfg.Bucket}, {"S3_ACCESS_KEY", cfg.AccessKey}, {"S3_SECRET_KEY", cfg.SecretKey},
	} {
		if field.value == "" {
			return S3Config{}, fmt.Errorf("%s is required", field.name)
		}
	}
	endpoint, err := url.Parse(cfg.Endpoint)
	if err != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" || (endpoint.Path != "" && endpoint.Path != "/") {
		return S3Config{}, errors.New("invalid S3_ENDPOINT: must be an http(s) origin without credentials, query or fragment")
	}
	if !regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`).MatchString(cfg.Bucket) {
		return S3Config{}, errors.New("invalid S3_BUCKET: use 3-63 lowercase letters, numbers or hyphens")
	}
	if cfg.Region == "" {
		cfg.Region = "us-east-1"
	}
	return cfg, nil
}
