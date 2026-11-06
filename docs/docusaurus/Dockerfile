# Build context: repository root.
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS builder
WORKDIR /workspace/docs/docusaurus
COPY docs/docusaurus/package.json docs/docusaurus/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY docs/docusaurus/ ./
COPY docs/external/ /workspace/docs/external/
ARG DOCS_SITE_URL=http://localhost
ENV DOCS_SITE_URL=${DOCS_SITE_URL} \
    DOCS_BASE_URL=/docs/
RUN npm run build

FROM nginx:stable-alpine AS runtime
COPY docs/docusaurus/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /workspace/docs/docusaurus/build/ /usr/share/nginx/html/docs/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
