FROM --platform=$BUILDPLATFORM golang:1.25 AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o /server ./cmd/api
# The LLM service (deploy/compose.llm.yaml) runs from the same image with entrypoint /llm.
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o /llm ./cmd/llm

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /server /server
COPY --from=build /llm /llm
ENTRYPOINT ["/server"]
