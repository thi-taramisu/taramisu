# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY ./package* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
RUN npm run build
RUN mkdir -p /out && cp -r dist/. /out/

# Stage 2: Runtime
FROM nginx:1.27-alpine
COPY ./nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /out /usr/share/nginx/html
EXPOSE 5173