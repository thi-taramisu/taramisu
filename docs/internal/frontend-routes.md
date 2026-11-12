# Frontend routes

Status: implemented with placeholder pages (#30). The routes follow the wireframes in the [Whimsical concept
board](https://whimsical.com/taramisu-concept-MeRaRm6cqUmmG6KBFgjiim), sections "Concept 2: Hierarchical Workspace with Relations" and
"Graph Concept". Backend endpoints are out of scope here.

The additional design reference routes are `/design-system/colors` (all schemes) and `/design-system/colors/:schemeId` (`neutral`, `ocean`,
`iris`). The project list and workspace link to them. Pages and Filetree navigation render in the browser through React Router.
Deployment serves the static Vite build with an SPA fallback; see the [frontend README](../../frontend/README.md#client-rendering-and-deployment).

## Basis

The elements follow the ISO/SAE 21434 steps in the project scope (see course slides):

```text
Project
  └── Item                       (item definition, system diagram, item boundary)
        └── Asset                (+ cybersecurity properties C / I / A)
              └── Damage scenario      (impact per category S / F / O / P)
                    └── Threat scenario
                          └── Attack path   (+ attack feasibility rating)
```

In Concept 2 this hierarchy is the tree in the sidebar of the project workspace. Selecting an element opens its page on the right, with
tabs. Relations between scenarios are many-to-many (see #43 and PR #29), so an entity can appear under several relation branches. These
navigation branches do not define ownership.

Assets, damage scenarios, threat scenarios and attack paths each belong to exactly one item through `item_definition_id`, as defined in
the [data model](architecture/data-model.md) and `backend/db/schema.sql`. In the URL, `projectId` identifies the workspace and access-control
scope; it does not replace that item ownership. The owning item and breadcrumb context come from entity data. Future API lookups must
verify that the entity's owning item belongs to the requested project; the current mock routes do not implement authorization guards.

## Route table

| Route | Page | Wireframe | Auth |
| --- | --- | --- | --- |
| `/` | Redirect to `/projects` | | |
| `/login` | Login | | public, depends on the IAM decision (#46), not routed yet |
| `/projects` | Project list | Project / Start | user |
| `/projects/:projectId/settings` | Project settings, General | Project Settings (1) | manage |
| `/projects/:projectId/settings/members` | Project settings, Members | Project Settings (2) | read, changes need manage |
| `/projects/:projectId` | Project workspace (header, element tree, empty content) | Add Items / Layout | read |
| `/projects/:projectId/items/:itemId` | Item: Definition (form, supporting files, React Flow diagram) | Items / Item Definition | read, edit needs write |
| `…/items/:itemId/assets` | Item: Assets table | Items / Item Assets | read |
| `…/items/:itemId/risks` | Item: Risks | Summary / Item Summary | read |
| `…/items/:itemId/review` | Item: Review | | read |
| `/projects/:projectId/assets/:assetId` | Asset: Definition (incl. C / I / A) | Assets / Asset Definition | read |
| `…/assets/:assetId/risks`, `…/relations` | Asset: Risks, Relations | Asset Relation, Asset Summary | read |
| `/projects/:projectId/damage-scenarios/:id` | Damage scenario: Definition | DS Definition | read |
| `…/damage-scenarios/:id/impact`, `…/relations` | Damage scenario: Impact (S / F / O / P), Relations | DS Impact, DS Relation | read |
| `/projects/:projectId/threat-scenarios/:id` | Threat scenario: Definition | TS Definition | read |
| `…/threat-scenarios/:id/risks`, `…/treatment`, `…/relations` | Threat scenario: Risks, Treatment, Relations | TS Risks, TS Treatment, TS Relations | read |
| `/projects/:projectId/attack-paths/:id` | Attack path: Definition (steps) | AP Definition | read |
| `…/attack-paths/:id/rating`, `…/relations` | Attack path: Rating, Relations | AP Definition (rating), AP Relations | read |
| any element route + `?view=graph` | Graph view of the element and its relations | Graph Concept | read |
| `*` | Not found | | public |

Auth values: public means no login, user means logged in, and read, write and manage are the project permissions from
[project roles](architecture/iam/project-roles.md#permissions): read for Viewer, Editor and Owner, write (`edit`) for Editor and
Owner, manage for Owner only. Route guards follow with the frontend role ticket.

Implemented with content: the item pages (#94): "+ New → Item" dialog, delete confirmation, and the Definition, Assets and Risks tabs.
Everything else renders a placeholder. Items come from the item API in `frontend/src/api/`, an in-memory mock
(`frontend/src/api/mocks/`) seeded with the headlamp example (`frontend/src/api/mocks/data/headlamp.ts`, project id `headlamp`) until the
item routes (#83) are in `backend/openapi.json`. The tab list per element type is in `frontend/src/features/workspace/entities.ts`.

The damage scenario Relations tab (#185) links assets (with C / I / A) and threat scenarios of the owning item through the mock API. It is
built from `frontend/src/features/relations/`, which the threat scenario and attack path Relations tabs can reuse. Damage and threat scenarios
without a link are not in the tree until the "Unassigned" group exists; threat scenarios stay available in "+ Add Threat Scenario".

The threat scenario page (#194) has the Definition tab (name, cause, elicitation, technical notes, targets) and the Relations tab (damage
scenarios, attack paths), both on the mock API. Its Risks tab calculates the risk values with the
risk matrix from the impact of the linked damage scenarios and the most feasible linked attack path. Treatment is still a placeholder.

The attack path page (#195) has the Definition tab (name, analysis approach, partial flag, steps), the Rating tab (attack potential with
the five factors, total and feasibility) and the Relations tab (threat scenarios), all on the mock API.

The asset page (#196) has the Definition tab (name, identification source, description and the C / I / A properties with their
description), the Risks tab (one row per damage scenario × threat scenario of the asset, with the risk calculated as on the threat
scenario's Risks tab) and the Relations tab (damage scenarios with their properties; threat scenarios that target the asset or reach it
only via damage, both read-only), all on the mock API. The fields follow the data model: the wireframe's "Group" is not in the data model,
so it is left out. A property that leads to a damage scenario can only be removed after its links are removed. The Risks tab has no
treatment column yet, as treatment decisions are still a placeholder.

Assets are created in the "New Asset" dialog ("+ New → Asset", or "Add Asset" on the item's Assets tab with the item fixed): only the name
is required; item, component / interface and C / I / A properties are optional, and a similar existing asset of the item is pointed out.
"Create & open" opens the new asset's Definition tab.

## Decisions

These were the open questions in the first draft of this page. The wireframes answer most of them:

1. **One page per TARA step or tabs?** Neither in the old sense: there is one page per element (item, asset, …), selected in the tree, and
   each element page has tabs. The tabs are child routes (`…/impact`, `…/relations`), so they can be linked and the browser back button
   works.
2. **Several items per project?** Yes, the tree shows several items per project, so items have their own id in the URL.
3. **Deep links to single entities?** Yes, every element has its own URL. Creating elements ("+ New") happens in dialogs without their own
   route.
4. **Flat or nested URLs?** Flat per type under the project (`/projects/:projectId/threat-scenarios/:id`). This is a routing convention;
   each entity still has one owning item. Keeping the variable asset/scenario relation chain out of the URL allows links to stay stable
   when those relations change. The owning item and breadcrumb chips come from the data, not from the URL.
5. **Where do graphs live?** The "Graph" switch in the header turns the selected element's page into a graph of its relations (Graph
   Concept). This is a view mode, so it is a query parameter (`?view=graph`) and not a separate route. It stays on when you select another
   element in the tree. The item definition diagram (React Flow) is the Definition tab of an item.

## Open questions

1. **Auth and session:** token handling, the login flow and route guards depend on the IAM decision (#46).
2. **Language:** English only, or German as well?
3. **Read-only sharing:** is a public read-only link per project wanted?
4. **Archive:** the project list wireframe has an "Archive" entry. Separate route (`/projects/archive`) or a filter on `/projects`?
5. **Unassigned elements:** "Flexible Definition" in the wireframes adds an "Unassigned" group to the tree for elements without a parent.
   They still get the same flat URLs, so no extra route is needed.
