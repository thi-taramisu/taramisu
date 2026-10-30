# Asset properties API: frontend handoff

Implements [issue #160](https://github.com/thi-taramisu/taramisu/issues/160), building on
[PR #154](https://github.com/thi-taramisu/taramisu/pull/154) for asset CRUD.
The issue branch is based on PR #154's `feature/84-assets-crud-api` branch; merge that dependency first.

## Routes

All routes use the existing Authentik login and `taramisu_session` cookie.
Use `/auth/login` to establish a session. See the [backend authentication documentation](../../../backend/README.md#authentication).

The prefix below is `/api/v1/item-definitions/{item_definition_id}`:

| Entity | Collection suffix |
| --- | --- |
| Asset | `/assets` |
| Asset cybersecurity property | `/assets/{asset_id}/cybersecurity-properties` |
| Damage scenario asset property link | `/damage-scenario-asset-properties` |
| Threat scenario asset property link | `/threat-scenario-asset-properties` |

Every collection supports `GET` (list) and `POST` (create). Append `/{id}` for
`GET` (read), `PUT` (replace), `PATCH` (partial update), and `DELETE`.

- `POST` returns `201`, the created record, and a `Location` header.
- Read, list, replace, and update return `200`. Delete returns `204` without a body.
- Lists are JSON arrays, with `[]` for no matches, ordered by record UUID.
  Pagination uses `limit` (default 50, range 1–100) and `offset` (default 0, range 0–2147483647).
- The URL fixes the item definition and, for properties, the owning asset.
  Do not include these parent IDs or a record's `id` in request bodies.
- Referenced damage/threat scenarios and properties must exist in the URL's item definition.
  Replacing or patching a link can change its references within that item.
- `PUT` requires every required field and clears omitted optional fields.
  `PATCH` preserves omitted fields; explicit `null` clears optional text fields.
  An empty PATCH object leaves an existing record unchanged. Required fields cannot be `null`.
- Deleting an asset deletes its properties and their links. Deleting a property deletes its
  damage/threat links. Deleting a link preserves its scenario and property.

## Request bodies

Asset create/replace (provided by PR #154):

```json
{
  "name": "Brake ECU",
  "description": "Controls braking",
  "identification_source": "ITEM_DEF"
}
```

`name` is required and must contain a non-whitespace character. `description` and
`identification_source` are optional and nullable. Identification sources are `ITEM_DEF`,
`IMPACT_RATING`, `THREAT_DERIVED`, and `CATALOGUE`.

Property create/replace:

```json
{
  "property_type": "INTEGRITY",
  "description": "Brake commands must remain unmodified"
}
```

`property_type` is required: `CONFIDENTIALITY`, `INTEGRITY`, or `AVAILABILITY`.
`description` is optional and nullable. Each asset can have one property of each type.

Damage link create/replace:

```json
{
  "damage_scenario_id": "00000000-0000-4000-8000-000000000001",
  "asset_cybersecurity_property_id": "00000000-0000-4000-8000-000000000002",
  "compromise_mechanism_note": "Modified brake commands can cause unintended braking"
}
```

Both UUIDs are required. `compromise_mechanism_note` is optional and nullable.

Threat link create/replace:

```json
{
  "threat_scenario_id": "00000000-0000-4000-8000-000000000003",
  "asset_cybersecurity_property_id": "00000000-0000-4000-8000-000000000002"
}
```

Both UUIDs are required. A scenario/property pair can occur only once in each link collection.
For PATCH, send any subset of the same fields. For example, `{"description":null}` clears
a property description; `{"compromise_mechanism_note":null}` clears a damage link's note.

Responses contain the fields above plus the server-generated UUID `id`. Asset responses include
`item_definition_id`; property responses include `asset_id`. Nullable response fields appear as
`null` when unset.

## Errors and contract generation

Errors use `application/problem+json`:

| Status | Meaning |
| --- | --- |
| `401` | Missing or expired session |
| `404` | Record or referenced parent not found in the URL's item definition |
| `409` | Duplicate asset/property type or scenario/property pair |
| `422` | Invalid UUID, enum, body, pagination, or a reference deleted during the request |
| `503` | Authentication configuration or database unavailable |

Malformed JSON returns `400`. A list for an unknown parent returns `[]`.
The `409` mapping applies to the property/link routes; assets have no uniqueness constraint on names.

The generated contract is [`backend/openapi.json`](../../../backend/openapi.json).
Swagger UI is available at `/docs` and the runtime contract at `/openapi.json`.
After changing handlers, run `make openapi` from `backend/` and commit the updated JSON.
The frontend can generate types from that contract as part of the API client integration.
This handoff is ready to share with the frontend team.
