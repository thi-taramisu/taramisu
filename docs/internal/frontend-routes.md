# Frontend routes (concept, draft for discussion)

Status: draft. It is meant as a discussion basis and should be aligned with the wireframes (#6, #10) and the TARA process analysis (#9). Backend endpoints are out of scope here.

## Basis

The routes follow the ISO/SAE 21434 steps in the project scope (see course slides):

```
Project
  └── Item Definition            (system diagram, item boundary)
        └── Assets               (+ cybersecurity properties C / I / A)
              └── Damage scenarios      (impact per category S / F / O / P, rated 0-3)
                    └── Threat scenarios
                          └── Attack paths   (+ attack feasibility rating)
                                └── Risk values + risk treatment decision
```

The old tool (THIARA) used the same hierarchy, with per-project access levels (Read, Write, Manage, Owner).

## Route table

| Route | Page | Auth | Notes |
|---|---|---|---|
| `/login` | Login | public | Depends on the IAM research (#3) |
| `/projects` | Project list | user | Create, open and delete projects |
| `/projects/:projectId` | Project overview | read | Progress per TARA step, summary |
| `/projects/:projectId/members` | Members and access | manage | Invite users, set access level |
| `/projects/:projectId/items` | Item list | read | |
| `/projects/:projectId/items/:itemId` | Item definition (diagram) | read, edit needs write | React Flow editor, **implemented as example at `/item-definition`** |
| `/projects/:projectId/items/:itemId/assets` | Assets | read | Table with C / I / A |
| `/projects/:projectId/items/:itemId/damage-scenarios` | Damage scenarios and impact | read | Impact per category S / F / O / P |
| `/projects/:projectId/items/:itemId/threat-scenarios` | Threat scenarios | read | |
| `/projects/:projectId/items/:itemId/attack-paths` | Attack paths and feasibility | read | Graph view (React Flow) plus rating |
| `/projects/:projectId/items/:itemId/risk` | Risk values and treatment | read | Risk matrix, treatment decision |
| `/projects/:projectId/items/:itemId/report` | Report / export | read | Optional, later |
| `*` | Not found | public | |

Auth values: public means no login, user means logged in, and read, write and manage are the project access levels.

Currently implemented: only `/item-definition`, a standalone example with hard-coded headlamp data. Everything else is concept.

## Navigation sketch

- Top level: project list, then one project.
- Inside a project: a sidebar with the TARA steps in process order (Item definition, Assets, Damage scenarios, Threat scenarios, Attack paths, Risk), plus Members.
- The item is part of the URL so that several items per project are possible.

## Open questions for the team

1. **One page per TARA step or tabs on one item page?** The table assumes separate pages (deep links, simpler code). Tabs would feel more compact.
2. **Several items per project?** The old tool allowed it. If we only need one, `:itemId` could be dropped.
3. **Deep links to single entities**, for example `/assets/:assetId`, or editing in side panels and dialogs without their own route?
4. **Where do graphs live?** Item definition and attack paths are natural React Flow views. Should damage and threat scenarios also have a graph or tree view?
5. **Auth and session:** token handling and the login flow depend on the IAM decision (#3).
6. **Language:** English only, or German as well?
7. **Read-only sharing:** is a public read-only link per project wanted?
