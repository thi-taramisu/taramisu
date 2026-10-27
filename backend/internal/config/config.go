package config

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
)

const defaultHTTPAddr = ":8080"

// Config contains the runtime configuration for the API.
type Config struct {
	HTTPAddr    string
	DatabaseURL string
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

	return Config{
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
