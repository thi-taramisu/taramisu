FROM --platform=$BUILDPLATFORM golang:1.25 AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o /server ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /server /server
ENTRYPOINT ["/server"]
