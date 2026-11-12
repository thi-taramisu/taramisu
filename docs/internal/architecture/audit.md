# Audit and logging

Status: proposal for [#218](https://github.com/thi-taramisu/taramisu/issues/218), under team review; the rollout is
tracked in [#265](https://github.com/thi-taramisu/taramisu/issues/265). Implementation follows in separate PRs (see
[Rollout](#rollout)). Today only the four membership and deletion events in [project roles](iam/project-roles.md#audit)
are written, and only as log lines.

## TL;DR

- Taramisu keeps a **persistent audit history** in PostgreSQL: one row per successful change, written in the same transaction
  as the change, with actor, project, target, and values before and after. People appear only as IDs, never with names or
  email addresses.
- Failed logins, denied requests, and errors go to the **security and operations log** (structured JSON on stderr), not into
  the database.
- Audit events are kept while the project exists and are deleted **one year after the project is deleted**.
- At first only operators read the history, directly in the database. Showing it in the application is an open question.

## Purpose

The history serves two purposes: investigating security incidents (for example an unexpected role change or a deleted
project) and tracing changes to TARA work products. It is not meant for evaluating the performance or behaviour of people.
This purpose limits who reads the data and how long it is kept, see [Who may read the history](#who-may-read-the-history)
and [Personal data](#personal-data).

## Three channels

Audit history and logs serve different readers and need different retention, so they are kept apart.

| Channel | Content | Storage | Readers | Retention |
| --- | --- | --- | --- | --- |
| Audit history | Successful changes to projects, members, and analysis content | Table `audit_event` | Operators; later possibly Owners, see [Open questions](#open-questions) | Project lifetime + 1 year |
| Security log | Failed authentication, denied access (`403`/`404`), unhandled errors | JSON log on stderr (journald on the VM) | Members of `systemd-journal` on the VM | Not defined yet, see [Open questions](#open-questions) |
| Operations log | One line per request: request ID, method, path, route, status, duration, actor ID | JSON log on stderr (journald on the VM) | Members of `systemd-journal` on the VM | Not defined yet |

Denied and failed requests stay out of the database: anyone can trigger them in large numbers, and they do not change the
project.

## Principles

1. **Who, what, when, where, before and after.** Every event records the actor, the event name, the target (type and ID), the
   project, the time, the values before and after, and the request ID that links it to the logs.
2. **Same transaction.** The event is written in the transaction that makes the change. A change is never stored without its
   event, and a rolled-back change (for example the `409` for the last Owner) leaves no event. A change that changes nothing,
   such as setting a role to the role a member already has, records no event.
3. **Every change, through one entry point.** Every mutating API operation records its change through one generic entry
   point in the backend, which all record types use. A test fails for a mutating operation that is declared neither as
   audited nor as not audited yet, so a new operation cannot bypass the history by accident.
4. **Append-only.** The application never updates or deletes audit rows, except for the retention cleanup. A separate database
   role with only `INSERT` and `SELECT` can enforce this later; the cleanup then needs its own role with `DELETE`. Database
   triggers are not used because Atlas manages triggers only in its paid edition.
5. **No foreign keys.** Events must outlive the project, the role assignment, and the user they describe.
6. **People only as IDs.** Actor, user, and group are internal IDs (`iam_user.id`, `iam_group.id`). Names and email addresses
   are resolved through Authentik when the history is shown, like in the member list. Project events keep only the project
   name, so that operators can tell which project an event belongs to, not the free-text description. Content events keep
   the record as the API returns it, including free text, because that is the work product whose history is traced.
7. **One event per API operation.** Membership and project events describe what happened (`member.role_changed`). Content
   events store the record as the API returns it, before and after. `project.deleted` also lists the role assignments it
   removes, so it stays visible who had access. Content records deleted by cascade get no event of their own; the deletion
   event of their parent ends their history.
8. **Reads are not audit events**, except export, because export moves project data out of Taramisu. The operations log
   still records which user requested which path.
9. **The log line carries no project data.** Each event is also written as an `audit` log line with IDs and roles only,
   because logs are read by a wider group and kept under different rules than the database.
10. **No tamper evidence in the prototype.** Hash chains or write-once storage can be added for production use.

## Events

| Area | Event | Before and after | Status |
| --- | --- | --- | --- |
| Project | `project.created` | After: name, first Owner | Planned |
| Project | `project.updated` | Name before and after, whether the description changed; later default rating method, AI toggle | Planned |
| Project | `project.deleted` | Before: name and role assignments (role, user or group) | Log only |
| Project | `project.archived`, `project.restored` | – | With archiving |
| Project | `project.imported`, `project.exported` | Format and version | With import and export |
| Members | `member.added` | After: role, user or group | Log only |
| Members | `member.role_changed`, including ownership transfer | Role before and after, user or group | Log only |
| Members | `member.removed`, including leaving | Before: role, user or group. The actor equals the user when someone left | Log only |
| Analysis content | `<record>.created`, `<record>.updated`, `<record>.deleted` | API representation before and after | Planned |
| AI assistant | `ai_suggestion.applied` | Target record, applied fields, model | With the AI assistant |
| Review | `review.requested`, `review.approved`, `review.rejected` | Reviewed state | With the review workflow |

Analysis content covers item definitions, assets, cybersecurity properties, damage scenarios, impact ratings, threat
scenarios, attack paths, attack feasibility ratings, threat–damage and threat–attack-path links, risk values, and risk treatment
decisions. This history makes changes to TARA work products traceable, which helps with the change management of work
products that [ISO/SAE 21434](../../external/concepts/tara.md) builds on; it does not replace it. Baselines (frozen versions of
a TARA for a release) are a separate feature and can build on export.

Not recorded anywhere: raw request bodies, tokens, and names or email addresses of people from the identity provider.

## Storage

```sql
CREATE TABLE audit_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  tara_project_id uuid NOT NULL,  -- no foreign key: survives project deletion
  actor_user_id   uuid NOT NULL,  -- iam_user.id, no foreign key
  event           text NOT NULL,  -- for example 'member.role_changed'
  target_type     text NOT NULL,
  target_id       uuid NOT NULL,
  before          jsonb,
  after           jsonb,
  request_id      text
);
CREATE INDEX audit_event_project_time_idx ON audit_event (tara_project_id, occurred_at DESC);
CREATE INDEX audit_event_project_deleted_idx ON audit_event (occurred_at) WHERE event = 'project.deleted';
```

- `event` is text, not an enum: the list grows with every record type, and the event names are defined once as Go constants.
- `occurred_at` uses `clock_timestamp()`: `now()` is the start of the transaction, so events written in one transaction would
  share it and lose their order.
- Every event has a user as actor. Changes made by the system itself (retention cleanup, changes by SQL) are not recorded;
  a system actor can be added when a feature needs one.

In the backend, one store helper opens the transaction, optionally locks the project row (as membership changes do today),
runs the change, inserts the event, and writes the `audit` log line after the commit. Handlers pass only the actor. The first
PR with content events adds one generic entry point for content changes, so that each record type does not need its own
store method.

## Retention

- Events are kept as long as their project exists, because they document how the project's work products came about.
- Content events hold copies of the analysis content, which can be confidential. Deleting a project therefore removes its
  content from the history only when the retention period ends. Clearing `before` and `after` of content events when the
  project is deleted would avoid that, see [Open questions](#open-questions).
- One year after `project.deleted`, all events of that project are deleted. One year leaves time to notice and investigate an
  unwanted deletion, for example at the next periodic review, without keeping data about people indefinitely. The API runs
  this cleanup once a day; the period is configurable (`AUDIT_RETENTION_AFTER_DELETE`, default `8760h`).
- The cleanup finds deleted projects by their `project.deleted` event. Projects deleted directly in the database have no such
  event, and their events are not removed.
- Log retention depends on the journald configuration of the VM ([deployment guide](../../../deploy/README.md)) and is not
  defined yet.

## Who may read the history

Two things are often both called an audit log:

- A **compliance audit trail** is for investigating incidents, such as an unexpected role change or missing data. Few people
  read it.
- An **activity history** is a user feature, for example "who changed this damage scenario" or "what changed since the last
  review".

At first, Taramisu only stores events. Operators read them with SQL, for example:

```sql
SELECT occurred_at, actor_user_id, event, target_type, target_id, before, after
FROM audit_event
WHERE tara_project_id = '<project id>'
ORDER BY occurred_at DESC;
```

Events of deleted projects stay readable for operators only.

## Personal data

- Actor, user, and group IDs are pseudonymous personal data: `iam_user` keeps the Authentik subject, so an ID can be linked
  to a person as long as Authentik knows the account.
- The stored history and the logs can show who changed what and when, even without a user interface. Where Taramisu is used
  by employees in Germany, such data can require works council co-determination (§ 87 (1) no. 6 BetrVG). Its use must stay
  within the purpose stated above.
- How an erasure request is handled for audit events is not decided yet, see [Open questions](#open-questions).

## Rollout

1. This document and the "Audit" section in [project roles](iam/project-roles.md#audit) (decision).
2. Logging foundation: JSON logging, request IDs and request log, logging of denied requests and unhandled errors.
3. Audit storage: table `audit_event`, store helper, retention cleanup, and the four membership and deletion events stored with
   PostgreSQL tests.
4. Generic entry point for all record types, with project settings and item definitions as its first users
   ([#267](https://github.com/thi-taramisu/taramisu/issues/267)).
5. Remaining analysis content, one PR per area ([#268](https://github.com/thi-taramisu/taramisu/issues/268) to
   [#271](https://github.com/thi-taramisu/taramisu/issues/271)).
6. Events that belong to future features (archiving, import and export, AI assistant, review) are added with those features.

## Open questions

- **Showing the history in the application.** Candidates are a member and settings history for Owners, and a change history
  per record for the review workflow. A history visible to colleagues makes monitoring individual work easier, see
  [Personal data](#personal-data). The team decides once a concrete use case exists.
- **Log retention.** journald on the VM rotates by size by default. A fixed period (for example `MaxRetentionSec=90day`) has
  to be agreed with the team that runs the VM.
- **Content after project deletion.** Whether content events keep the analysis content until retention ends, as now, or
  lose `before` and `after` when the project is deleted and keep only who changed what and when.
- **Erasure requests.** Whether audit events of a person are kept (as pseudonymous records for incident investigation) or
  anonymised on request.
