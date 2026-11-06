package auth

import (
	"sync"
	"time"
)

const (
	defaultCacheTTL = 10 * time.Minute
	defaultCacheMax = 4096
)

type cacheEntry[V any] struct {
	value   V
	expires time.Time
}

// ttlCache is a bounded, thread-safe in-memory cache with per-entry TTL expiration.
type ttlCache[K comparable, V any] struct {
	mu      sync.RWMutex
	entries map[K]cacheEntry[V]
	ttl     time.Duration
	maxSize int
	now     func() time.Time
}

func newTTLCache[K comparable, V any](ttl time.Duration, maxSize int) *ttlCache[K, V] {
	if ttl <= 0 {
		ttl = defaultCacheTTL
	}
	if maxSize <= 0 {
		maxSize = defaultCacheMax
	}
	return &ttlCache[K, V]{
		entries: make(map[K]cacheEntry[V]),
		ttl:     ttl,
		maxSize: maxSize,
		now:     time.Now,
	}
}

func (c *ttlCache[K, V]) get(key K) (V, bool) {
	now := c.now()
	c.mu.RLock()
	entry, ok := c.entries[key]
	c.mu.RUnlock()
	if !ok {
		var zero V
		return zero, false
	}
	if !now.Before(entry.expires) {
		c.mu.Lock()
		if current, exists := c.entries[key]; exists && !now.Before(current.expires) {
			delete(c.entries, key)
		}
		c.mu.Unlock()
		var zero V
		return zero, false
	}
	return entry.value, true
}

func (c *ttlCache[K, V]) set(key K, value V) {
	now := c.now()
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.entries[key]; !exists && len(c.entries) >= c.maxSize {
		c.evictLocked(now)
	}
	c.entries[key] = cacheEntry[V]{
		value:   value,
		expires: now.Add(c.ttl),
	}
}

func (c *ttlCache[K, V]) evictLocked(now time.Time) {
	for k, v := range c.entries {
		if !now.Before(v.expires) {
			delete(c.entries, k)
		}
	}
	if len(c.entries) < c.maxSize {
		return
	}
	var oldestKey K
	var oldestTime time.Time
	first := true
	for k, v := range c.entries {
		if first || v.expires.Before(oldestTime) {
			oldestKey = k
			oldestTime = v.expires
			first = false
		}
	}
	if !first {
		delete(c.entries, oldestKey)
	}
}
