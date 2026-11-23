# ADR 0006: Protection against conflicting edits

- Status: Proposed
- Issue: #241
- Related: #89 (who is editing), [conflicting edits](../architecture/backend/backend-architecture.md#conflicting-edits) (API
  contract and implementation)

## Context

Two users open the same record, change it, and save. The second save silently overwrites the first, also in fields the second
user did not touch, because forms send all their fields. Transactions do not prevent this: each save is consistent on its own,
but it is based on a state the user read minutes earlier (lost update).

## Options

1. **No protection.** The last save wins. Simple, but changes get lost without anyone noticing.
2. **Edit locks** (#89): a user locks a record while editing it. Needs heartbeats, locks left behind by closed tabs, and a way
   to release them; a client that ignores the lock is not stopped.
3. **Optimistic concurrency with `updated_at`.** No migration of the API contract, but two saves in the same millisecond have
   the same timestamp, and it depends on the clock.
4. **Optimistic concurrency with PostgreSQL's `xmin`.** No column to maintain, but it is implicit, changes on every physical
   update, and does not survive a dump and restore.
5. **Optimistic concurrency with a `version` column and HTTP preconditions** (RFC 9110). Every update raises the version;
   a change sends the version it is based on as `If-Match`, and an outdated one is rejected with `412 Precondition Failed`.

## Decision

Option 5. The backend checks the version on the row it locks for the change anyway, so the check and the write are atomic
without an extra query. Responses carry the version as the `version` field (also in lists) and as the `ETag` header.

- It protects against every client, not only against the frontend.
- No state has to be cleaned up when a user leaves.
- It follows the HTTP standard, so clients and tools know the headers.

Creating records and links between records need no version: there is nothing to overwrite.

## Consequences

- The frontend sends the `version` it read as `If-Match` and, on `412`, keeps the user's input and offers to reload. An
  indicator of who is editing (#89) can be added on top, but it does not replace the check.
- Until the frontend sends the header, a change without it is not checked. `REQUIRE_IF_MATCH=true` then rejects it with
  `428 Precondition Required`; the switch is a deployment setting, not a code change.
- New editable tables get a `version` column, and new `PUT`, `PATCH`, and `DELETE` operations check it; guard tests enforce
  both.
