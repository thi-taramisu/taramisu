FROM --platform=$BUILDPLATFORM golang:1.25 AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o /server ./cmd/api \
    && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o /restore-project ./cmd/restore-project

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /server /server
# Operators restore a deleted project with this (deploy/README.md).
COPY --from=build /restore-project /restore-project
ENTRYPOINT ["/server"]
