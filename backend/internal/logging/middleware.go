package logging

import (
	"context"
	"crypto/rand"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"runtime/debug"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// RequestIDHeader carries the request ID. NGINX sets it to its own $request_id, so its access log and
// the API logs share one ID; the API returns it so users can quote it when reporting an error.
//
// The API accepts the header from whoever sends it. That is safe behind NGINX, which always overwrites
// it; a client that reaches the API directly (for example with make run) can choose its own IDs.
const RequestIDHeader = "X-Request-ID"

// validRequestID limits accepted IDs to what NGINX generates and what fits safely into a log line.
var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

type requestKey struct{}

// request is the per-request state shared between the middleware and the handlers it wraps.
type request struct {
	id    string
	actor string
}

// RequestID returns the ID of the request that ctx belongs to, or "" outside a request.
func RequestID(ctx context.Context) string {
	if req, ok := ctx.Value(requestKey{}).(*request); ok {
		return req.id
	}
	return ""
}

// SetActor records the authenticated user's internal ID for the request log. The authentication
// middleware calls it; the middleware below runs before authentication and cannot see the user itself.
func SetActor(ctx context.Context, userID string) {
	if req, ok := ctx.Value(requestKey{}).(*request); ok {
		req.actor = userID
	}
}

// Middleware assigns each request an ID, writes one log line when the request ends, and turns a panic
// into a logged 500. If the response has already started, it logs the panic and aborts the response. It must run inside the chi router so that the
// route pattern is known when the request is logged.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		id := r.Header.Get(RequestIDHeader)
		if !validRequestID.MatchString(id) {
			id = rand.Text()
		}
		req := &request{id: id}
		ctx := context.WithValue(r.Context(), requestKey{}, req)
		w.Header().Set(RequestIDHeader, id)
		ww := &startedWriter{WrapResponseWriter: middleware.NewWrapResponseWriter(w, r.ProtoMajor)}

		defer func() {
			abort := false
			if recovered := recover(); recovered != nil {
				if err, ok := recovered.(error); ok && errors.Is(err, http.ErrAbortHandler) {
					panic(recovered)
				}
				slog.ErrorContext(ctx, "panic while handling request", "panic", recovered, "stack", string(debug.Stack()))
				if !ww.started() {
					// The same problem+json body as every other error of the API.
					ww.Header().Set("Content-Type", "application/problem+json")
					ww.WriteHeader(http.StatusInternalServerError)
					_, _ = ww.Write([]byte(`{"title":"Internal Server Error","status":500,"detail":"internal server error"}` + "\n"))
				} else {
					// The response has started and cannot become a 500 any more.
					abort = true
				}
			}
			logRequest(ctx, r, ww, req, time.Since(start), abort)
			if abort {
				// Makes net/http close the connection, so the client sees a failed response, not a complete one.
				panic(http.ErrAbortHandler)
			}
		}()
		next.ServeHTTP(ww, r.WithContext(ctx))
	})
}

// startedWriter tells whether the response has started. chi's wrapper does not record a status when
// a handler flushes before writing, although net/http has then already sent a 200.
type startedWriter struct {
	middleware.WrapResponseWriter
	flushed bool
}

// Flush flushes the wrapped writer; http.NewResponseController finds it here and other features,
// such as Hijack, through Unwrap.
func (w *startedWriter) Flush() {
	w.flushed = true
	_ = http.NewResponseController(w.WrapResponseWriter).Flush()
}

func (w *startedWriter) started() bool { return w.flushed || w.Status() != 0 }

func logRequest(ctx context.Context, r *http.Request, ww middleware.WrapResponseWriter, req *request, duration time.Duration, aborted bool) {
	status := ww.Status()
	if status == 0 {
		status = http.StatusOK
	}
	// Health checks run every few seconds; keep them out of the default log level.
	level := slog.LevelInfo
	if strings.HasPrefix(r.URL.Path, "/health/") {
		level = slog.LevelDebug
	}
	attrs := []slog.Attr{
		slog.String("method", r.Method),
		slog.String("path", r.URL.Path),
		slog.Int("status", status),
		slog.Int64("duration_ms", duration.Milliseconds()),
	}
	if rctx := chi.RouteContext(ctx); rctx != nil && rctx.RoutePattern() != "" {
		attrs = append(attrs, slog.String("route", rctx.RoutePattern()))
	}
	if req.actor != "" {
		attrs = append(attrs, slog.String("actor", req.actor))
	}
	if aborted {
		// The status was already sent, so it stays in the line; the client did not get a complete response.
		attrs = append(attrs, slog.Bool("aborted", true))
	}
	slog.LogAttrs(ctx, level, "request", attrs...)
}
