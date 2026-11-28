# Project export

`GET /api/v1/projects/{id}/export` returns a whole TARA project as one JSON document. It needs the `read` permission
(Viewer or higher) and is written to the audit log as `project.exported`. The response has a `Content-Disposition`
header, so browsers save it as `project-<id>.json`.

This is the first format version. The file format of the later import is decided in the export/import concept (#242).

## What is included

Included: the project, its item definitions and everything below them. Not included: project members and role
assignments, and uploaded files such as the title image.

All records keep their IDs. References between records use these IDs and always point to a record in the same item.

```text
format_version, exported_at
project                      id, name, description, created_at
items[]                      item definition fields
  assets[]                   asset fields
    cybersecurity_properties[]
  damage_scenarios[]
    impact_ratings[]
    asset_property_links[]   -> cybersecurity property
  threat_scenarios[]
    asset_property_links[]   -> cybersecurity property
    damage_scenario_links[]  -> damage scenario
    attack_path_links[]      -> attack path
    risk_values[]            -> impact rating
    risk_treatment_decisions[]  -> risk value (optional)
  attack_paths[]
    feasibility_rating       only if the path has one
```

Lists without entries are exported as `[]`. Optional fields without a value are `null` or left out, as in the normal API
responses, because the export reuses the same response types.

## Format version

`format_version` is `1`. Increase it (`ExportFormatVersion` in `backend/internal/httpapi/handlers/project_export.go`)
when the structure changes in a way an importer has to know about.

## Consistent snapshot

The API reads all tables inside one read-only `REPEATABLE READ` transaction (`Store.ExportProject`), so the export is
consistent even if someone edits the project while it runs. The number of queries is fixed (14), not per item.

## Tests

The integration test `TestProjectExportPostgres` loads `backend/internal/httpapi/handlers/testdata/project_export.sql`
and checks the document, its references, the permission check and empty projects. It runs with `TEST_DATABASE_URL`, see the
[backend README](../../../backend/README.md#tests-and-coverage).
