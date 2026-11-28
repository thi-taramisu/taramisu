# Project export and import

`GET /api/v1/projects/{id}/export` returns a whole TARA project as one JSON document. It needs the `read` permission
(Viewer or higher) and is written to the audit log as `project.exported`. The response has a `Content-Disposition`
header, so browsers save it as `project-<id>.json`.

This is the first format version. The [import](#import) reads the same format.

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

## Import

`POST /api/v1/projects/import` creates a **new** project from a document in the format of the export, so an exported
project can be imported again, also into another instance. Every active user may import, like creating a project, and
becomes the first Owner. Members and uploaded files are not part of the document, so they are not imported. The answer is
`201` with the new project, and the audit history records `project.imported` (name, format version, first Owner).

The import is complete or not at all: everything is created in one transaction. The body is limited to 10 MiB.

### The document

It has the structure of the export (see above) and accepts an export unchanged. The import types are
`ProjectImport…` in `backend/internal/httpapi/handlers/project_import.go`; they differ in what is optional:

- **Server fields are optional and ignored:** `exported_at`, `created_at`, `version`, and the IDs of the project and of
  records that nobody refers to, and the parent IDs (`item_definition_id`, `asset_id`, `damage_scenario_id`,
  `threat_scenario_id`, `attack_path_id`): the position in the document says where a record belongs.
- **Lists may be left out** when they are empty.
- **IDs are keys.** The import gives every record a new ID. An `id` is only needed for a record that another record refers
  to: a cybersecurity property, a damage scenario, an impact rating, an attack path, and a risk value. Any text up to 100
  characters works, for example `p1`; the UUIDs of an export work too. A key must be unique among the records of its kind
  in one item.
- **References stay inside one item.** A reference to a key that does not exist in the same item is rejected. A treatment
  decision may only refer to a risk value of its own threat scenario.
- `format_version` must be the version the server writes (`1`); another version is rejected.

A smallest document:

```json
{ "format_version": 1, "project": { "name": "Imported" } }
```

### Errors

A document that breaks a rule is rejected with `422`, and the error names the place in the document, for example
`body.items[0].threat_scenarios[2].damage_scenario_id`. This covers unknown fields, enum values, unresolved or duplicate
keys, and the rules of the database (for example one property type per asset, or an omitted rating that has a value).

### What is not kept

A copy has new IDs, creation times, and versions; the content is the same. `TestProjectImportPostgres` exports a project,
imports the file, exports the copy, and compares both ignoring IDs, times, versions, and order.

### Keeping import and export in step

`TestImportTypesFollowExportTypes` compares the JSON properties of the export and import types. A field that is added to
the export and not to the import fails it, because the import would reject an export that contains the field.
