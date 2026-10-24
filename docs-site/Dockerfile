# Optional hand-off to the infrastructure owner. Build context: repository root.
FROM node:24-bookworm-slim AS builder
WORKDIR /workspace/docs-site
COPY docs-site/package.json docs-site/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY docs-site/ ./
COPY docs/external/ /workspace/docs/external/
ARG DOCS_SITE_URL=http://localhost:8080
ARG DOCS_REPOSITORY_URL=
# This initial container serves a dedicated domain/port at /.
ENV DOCS_SITE_URL=${DOCS_SITE_URL} \
    DOCS_REPOSITORY_URL=${DOCS_REPOSITORY_URL} \
    DOCS_BASE_URL=/
RUN npm run build

FROM nginx:stable-alpine AS runtime
COPY docs-site/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /workspace/docs-site/build/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
