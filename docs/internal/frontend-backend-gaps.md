# Frontend Features missing from the Backend

- Status: Proposed
- Issue: #182

## Scope

A feature counts as **missing** if the current frontend or the wireframes need it and the database or data model cannot support it today.
Compared on 2026-11-08 against `main` at `ae76b8d`.

## Missing Features

| Category        | Feature                                                                                    | Basis     | Question                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------- |
| Project         | Project title image, uploaded at creation or in the settings                               | Frontend  |                                                                                             |
| Project         | Favorites, personal per user                                                               | Frontend  |                                                                                             |
| Project         | Archive and restore, archived projects are read-only for all members                       | Frontend  |                                                                                             |
| Project         | (Optional) Default feasibility method setting for new attack paths                         | Wireframe |                                                                                             |
| Project         | Delete a project (that may contain items) with all its content                             | Wireframe |                                                                                             |
| Project         | Export and import as a file                                                                | Wireframe | Requirement                                                                                 |
| Item            | Supporting files, several per item                                                         | Frontend  |                                                                                             |
| Item            | Delete an item with its assets and scenarios                                               | Frontend  |                                                                                             |
| All elements    | Display IDs such as `A-01`, `DS-01`, `TS-01`, `AP-01`                                      | Frontend  | Numbered per project or per item? Do items get an ID? Must IDs stay stable after deletions? |
| All elements    | Global search by name and display ID, with filters, limited to accessible projects (#193)  | Issue     | Can this be frontend-only, or does it need backend support?                                 |
| Threat Scenario | One property per target asset                                                              | Wireframe | Concept #02 allows one; the data model allows several. Which rule applies?                  |
| Attack Path     | (Optional) Rating method per path: Attack potential, CVSS exploitability, or Attack vector | Wireframe | Only attack potential can be stored today.                                                  |
| Risk            | Risk calculation and aggregated feasibility and risk values                                | Wireframe | Calculated by the backend, or sent by the client? PR #205 expects the client to send it.    |
| Collaboration   | Protection against conflicting edits (#89)                                                 | Issue     |                                                                                             |
| AI              | (Optional) AI assistant with on/off setting per project, off by default                    | Wireframe |                                                                                             |
| AI              | (Optional) Elements and fields marked "AI" until reviewed; accepted suggestions logged     | Wireframe |                                                                                             |
