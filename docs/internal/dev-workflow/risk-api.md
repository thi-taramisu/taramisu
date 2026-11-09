# Risk API: frontend handoff

Implements [issue #163](https://github.com/thi-taramisu/taramisu/issues/163) using the existing
`risk_value` and `risk_treatment_decision` tables. No database migration is required.

## Routes and authentication

Both collections are under `/api/v1/threat-scenarios/{threat_scenario_id}`:

| Resource | Collection suffix |
| --- | --- |
| Risk value | `/risk-values` |
| Risk treatment decision | `/risk-treatment-decisions` |

| Method | Target | Result |
| --- | --- | --- |
| GET | Collection | Array, ordered by ID; empty results return `[]` |
| POST | Collection | Create; return 201 with the record and a `Location` header |
| GET | Collection plus `/{id}` | Read one record |
| PUT | Collection plus `/{id}` | Replace all editable fields |
| PATCH | Collection plus `/{id}` | Update only supplied fields |
| DELETE | Collection plus `/{id}` | Delete; return 204 |

Lists accept `limit` (default 50, range 1–100) and `offset` (default 0, nonnegative).
Requests require `Authorization: Bearer <JWT>` from the existing Authentik OIDC PKCE login.
The caller must have a role in the threat scenario's project, directly or through an assignable Authentik group
from the signed `taramisu_groups` token claim. Viewers can read; Editors and Owners can write.
Routes use the [shared project authorization](../architecture/iam/project-roles.md) before entering the handler.

## Risk value fields

POST and PUT require:

- `impact_rating_id`: UUID of an impact rating whose damage scenario belongs to the same item as the threat scenario.
- `risk_score`: integer from 1 through 5, supplied by the client.
- `determination_method`: `RISK_MATRIX` or `RISK_FORMULA`.

The response also includes generated `id` and the URL's `threat_scenario_id`.
Only one risk value may exist for each threat scenario and impact rating pair.
These routes store supplied scores; they do not calculate scores or update the threat scenario's aggregate score.

Example POST body:

```json
{
  "impact_rating_id": "33333333-3333-4333-8333-333333333333",
  "risk_score": 3,
  "determination_method": "RISK_MATRIX"
}
```

## Treatment decision fields

- `treatment_option` (required): `AVOIDING`, `REDUCING`, `SHARING`, or `RETAINING`.
- `risk_value_id` (optional, nullable): UUID of a risk value belonging to this same threat scenario.
- `decision_rationale` (optional, nullable): text explaining the decision.
- `is_cybersecurity_claim` (optional): boolean, defaults to false for POST and PUT.

`SHARING` and `RETAINING` require `is_cybersecurity_claim: true`, including when PATCH changes either field.
The response also includes generated `id` and the URL's `threat_scenario_id`.

Example POST body:

```json
{
  "treatment_option": "RETAINING",
  "decision_rationale": "Risk accepted with a documented cybersecurity claim",
  "is_cybersecurity_claim": true
}
```

PUT clears omitted optional fields and resets an omitted claim flag to false.
PATCH preserves omitted fields; explicit null clears `risk_value_id` or `decision_rationale`.
Explicit false updates the claim flag. Other PATCH fields cannot be null.
IDs and the owning threat scenario are not editable.

## Errors and deletion

| Status | Meaning |
| --- | --- |
| 401 | Missing, invalid, or expired Bearer token |
| 403 | Project member whose role does not permit this operation |
| 404 | Missing or inaccessible scenario/resource, or a related record outside its allowed scope |
| 409 | Duplicate threat/impact pair, referenced risk value, or a concurrent foreign-key conflict |
| 422 | Invalid UUID, enum, score, pagination, required field, or treatment claim |
| 500 | Unexpected database error; response omits database details |

Deleting a risk value that a treatment decision references returns 409. Clear the reference or delete the decision first.
Deleting a treatment decision preserves the associated risk value and threat scenario.
Responses use the API's existing problem JSON format.

## Generated contract and verification

The source of truth is the handlers registered by `backend/internal/httpapi/router.go`.
Regenerate `backend/openapi.json` with `make openapi` and the frontend client types with `npm run generate:api`.
The frontend UI continues using its current services; switching UI workflows to these routes is separate work.

Route tests use `httpapi.New` with fake stores and signed JWT fixtures. PostgreSQL fixtures create projects through
the API using `authtest.NewFixture(t, db.New(tx))`, making the caller Owner.
PostgreSQL tests exercise CRUD, pagination, project/group roles, cross-item/scenario isolation, duplicate handling,
PATCH semantics, claim constraints, and deletion dependencies inside a rolled-back transaction.
Run them with a migrated, isolated `TEST_DATABASE_URL` and the backend README's race/coverage commands.
