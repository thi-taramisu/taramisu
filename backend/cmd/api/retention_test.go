package main

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

type fakePurger struct {
	mu      sync.Mutex
	cutoffs []time.Time
	err     error
	called  chan struct{}
}

func (f *fakePurger) PurgeExpiredAuditEvents(ctx context.Context, cutoff pgtype.Timestamptz) (int64, error) {
	f.mu.Lock()
	f.cutoffs = append(f.cutoffs, cutoff.Time)
	f.mu.Unlock()
	select {
	case f.called <- struct{}{}:
	case <-ctx.Done(): // the test stopped listening
	}
	return 3, f.err
}

func TestCleanupRunsAtStartAndThenPeriodically(t *testing.T) {
	for _, failing := range []bool{false, true} {
		purger := &fakePurger{called: make(chan struct{})}
		if failing {
			purger.err = errors.New("database down") // logged; the loop keeps running
		}
		ctx, cancel := context.WithCancel(t.Context())
		done := make(chan struct{})
		start := time.Now()
		go func() {
			interval, retry := 10*time.Millisecond, time.Hour
			if failing {
				interval, retry = time.Hour, 10*time.Millisecond // a failure retries after retry, not after interval
			}
			runCleanup(ctx, "audit retention", purgeAuditEvents(purger, time.Hour), interval, retry)
			close(done)
		}()
		for range 2 {
			select {
			case <-purger.called:
			case <-time.After(time.Second):
				t.Fatal("cleanup did not run")
			}
		}
		cancel()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Fatal("cleanup did not stop after cancel")
		}
		purger.mu.Lock()
		first := purger.cutoffs[0]
		purger.mu.Unlock()
		if want := start.Add(-time.Hour); first.Before(want.Add(-time.Second)) || first.After(want.Add(time.Second)) {
			t.Errorf("cutoff = %v, want about %v", first, want)
		}
	}
}

type fakeProjectPurger struct {
	cutoff time.Time
	err    error
}

func (f *fakeProjectPurger) PurgeDeletedProjects(_ context.Context, cutoff pgtype.Timestamptz) ([]pgtype.UUID, error) {
	f.cutoff = cutoff.Time
	return []pgtype.UUID{{Bytes: [16]byte{0x23, 0x60}, Valid: true}}, f.err
}

func TestPurgeDeletedProjectsUsesTheGracePeriod(t *testing.T) {
	purger := &fakeProjectPurger{}
	start := time.Now()
	if err := purgeDeletedProjects(purger, 720*time.Hour)(t.Context()); err != nil {
		t.Fatal(err)
	}
	if want := start.Add(-720 * time.Hour); purger.cutoff.Before(want.Add(-time.Second)) || purger.cutoff.After(want.Add(time.Second)) {
		t.Errorf("cutoff = %v, want about %v", purger.cutoff, want)
	}
	purger.err = errors.New("database down")
	if err := purgeDeletedProjects(purger, time.Hour)(t.Context()); !errors.Is(err, purger.err) {
		t.Errorf("error = %v, want the store's error, so the loop retries", err)
	}
}
