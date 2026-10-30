# Stage 1: Build
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
COPY ./package* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENVIRONMENT=production
ARG VITE_SENTRY_RELEASE=
RUN npm run build

# Stage 2: Runtime
FROM nginx:1.27-alpine
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
