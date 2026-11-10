# Frontend Features missing from the Backend

- Status: Proposed
- Issue: #182

## Scope

A feature counts as **missing** if the current frontend or the wireframes need it and the database or data model cannot support it today.
Compared on 2026-11-08 against `main` at `ae76b8d`.

## Missing Features

| Category | Feature | Priority | Remark | Ticket |
| --- | --- | --- | --- | --- |
| Project | Project title image, uploaded at creation or in the settings | Low | | |
| Project | Favorites, personal per user | Medium | | |
| Project | Archive and restore, archived projects are read-only for all members | Medium | | |
| Project | (Optional) Default feasibility method setting for new attack paths | Low | | |
| Project | Delete a project (that may contain items) with all its content | High | | |
| Project | Export and import as a file | High | Concept ticket to be created | |
| Item | Supporting files, several per item | Medium | | |
| Item | Delete an item with its assets and scenarios | High | | |
| All elements | Store IDs for elements | High | | |
| All elements | Global search by name and display ID, with filters, limited to accessible projects (#193) | High | Waiting for frontend concept (#193) | |
| Attack path | (Optional) Rating method per path: attack potential, CVSS exploitability, or attack vector | Low | | |
| Risk | Risk calculation and aggregated feasibility and risk values | High | Agreed that risk values are calculated by the backend | |
| Collaboration | Protection against conflicting edits (#89) | Medium | | |
| AI | (Optional) AI assistant with on/off setting per project, off by default | Low | | |
| AI | (Optional) Elements and fields marked "AI" until reviewed; accepted suggestions logged | Low | | |
