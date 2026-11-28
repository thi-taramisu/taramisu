package logging

import (
	"errors"
	"net/http"
	"net/url"
)

// NewTunnelTransport routes Sentry requests through an internal ingest origin.
// The SDK keeps the original DSN in its envelope and authentication headers.
func NewTunnelTransport(origin string) (http.RoundTripper, error) {
	parsed, err := url.Parse(origin)
	if err != nil || parsed == nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return nil, errors.New("SENTRY_TUNNEL_URL must be an HTTP(S) origin without credentials, path, query, or fragment")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	return &tunnelTransport{origin: parsed, base: transport}, nil
}

type tunnelTransport struct {
	origin *url.URL
	base   http.RoundTripper
}

func (t *tunnelTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	forwarded := request.Clone(request.Context())
	forwarded.URL.Scheme = t.origin.Scheme
	forwarded.URL.Host = t.origin.Host
	forwarded.Host = ""
	return t.base.RoundTrip(forwarded)
}
