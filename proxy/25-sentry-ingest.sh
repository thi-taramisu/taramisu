#!/bin/sh
# Internal-only Sentry SaaS ingest route; never a general outbound proxy.
set -eu
output=${SENTRY_PROXY_CONFIG_PATH:-/etc/nginx/conf.d/default.conf}
tmp="${output}.tmp"
trap 'rm -f "$tmp"' EXIT INT TERM

if [ -z "${SENTRY_DSN:-}" ]; then
    cat > "$tmp" <<'NGINX'
server {
    listen 8081;
    server_name _;
    access_log off;
    location / { return 404; }
}
NGINX
else
    # Validate the complete DSN before interpolating only its host and numeric project.
    if [ "$(printf '%s' "$SENTRY_DSN" | tr -d '\r\n')" != "$SENTRY_DSN" ] || ! printf '%s\n' "$SENTRY_DSN" | LC_ALL=C grep -Eq '^https://[A-Za-z0-9]+(:[A-Za-z0-9]+)?@o[0-9]+\.ingest(\.[a-z][a-z0-9-]*)?\.sentry\.io/[0-9]+$'; then
        echo 'SENTRY_DSN must be a Sentry SaaS HTTPS DSN for the internal ingest proxy.' >&2
        exit 1
    fi
    authority=${SENTRY_DSN#https://}
    authority=${authority%%/*}
    ingest_host=${authority##*@}
    project=${SENTRY_DSN##*/}
    cat > "$tmp" <<NGINX
server {
    listen 8081;
    server_name _;
    access_log off;
    client_max_body_size 5m;
    resolver 127.0.0.11 valid=30s ipv6=off;

    location = /api/$project/envelope/ {
        if (\$request_method != POST) { return 405; }
        set \$sentry_ingest_host $ingest_host;
        proxy_pass https://\$sentry_ingest_host\$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host \$sentry_ingest_host;
        proxy_set_header Connection "";
        proxy_set_header Authorization "";
        proxy_set_header Cookie "";
        proxy_ssl_server_name on;
        proxy_ssl_name \$sentry_ingest_host;
        proxy_ssl_verify on;
        proxy_ssl_verify_depth 3;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
        proxy_connect_timeout 2s;
        proxy_read_timeout 5s;
        proxy_send_timeout 5s;
        proxy_next_upstream off;
        proxy_redirect off;
    }
    location / { return 404; }
}
NGINX
fi
mv "$tmp" "$output"
