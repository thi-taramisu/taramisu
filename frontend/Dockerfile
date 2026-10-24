# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY ./package* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM nginx:1.27-alpine
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80