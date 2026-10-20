# Frontend routes

Status: implemented with placeholder pages (#30). The routes follow the wireframes in the [Whimsical concept board](https://whimsical.com/taramisu-concept-MeRaRm6cqUmmG6KBFgjiim), sections "Concept 2: Hierarchical Workspace with Relations" and "Graph Concept". Backend endpoints are out of scope here.

## Basis

The elements follow the ISO/SAE 21434 steps in the project scope (see course slides):

```
Project
  └── Item                       (item definition, system diagram, item boundary)
        └── Asset                (+ cybersecurity properties C / I / A)
              └── Damage scenario      (impact per category S / F / O / P)
                    └── Threat scenario
                          └── Attack path   (+ attack feasibility rating)
```

In Concept 2 this hierarchy is the tree in the sidebar of the project workspace. Selecting an element opens its page on the right, with tabs. The relations are many-to-many though (a threat scenario can belong to several damage scenarios, see #43 and PR #29), so the tree is only one way to look at the data and an element has no single parent.

## Route table

| Route | Page | Wireframe | Auth |
|---|---|---|---|
| `/` | Redirect to `/projects` | | |
| `/login` | Login | | public, depends on the IAM decision (#46), not routed yet |
| `/projects` | Project list | Project / Start | user |
| `/projects/:projectId/settings` | Project settings, General | Project Settings (1) | manage |
| `/projects/:projectId/settings/members` | Project settings, Members | Project Settings (2) | manage |
| `/projects/:projectId` | Project workspace (header, element tree, empty content) | Add Items / Layout | read |
| `/projects/:projectId/items/:itemId` | Item: Definition (React Flow diagram) | Items / Item Definition | read, edit needs write |
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

Auth values: public means no login, user means logged in, and read, write and manage are the project access levels (as in the old THIARA tool). Route guards come with the IAM decision (#46).

Implemented with content: the item definition diagram (headlamp example) and the item assets table with the "Add asset" dialog. Everything else renders a placeholder. The data is hard-coded in `frontend/src/features/workspace/exampleProject.ts`, project id `headlamp`. The tab list per element type is in `frontend/src/features/workspace/entities.ts`.

## Decisions

These were the open questions in the first draft of this page. The wireframes answer most of them:

1. **One page per TARA step or tabs?** Neither in the old sense: there is one page per element (item, asset, …), selected in the tree, and each element page has tabs. The tabs are child routes (`…/impact`, `…/relations`), so they can be linked and the browser back button works.
2. **Several items per project?** Yes, the tree shows several items per project, so items have their own id in the URL.
3. **Deep links to single entities?** Yes, every element has its own URL. Creating elements ("+ New") happens in dialogs without their own route.
4. **Flat or nested URLs?** Flat per type under the project (`/projects/:projectId/threat-scenarios/:id`), not nested along the tree. Because of the many-to-many relations there is no single parent path, and a nested URL would break as soon as a relation changes. The path shown above the title (breadcrumb chips in the wireframes) comes from the data, not from the URL.
5. **Where do graphs live?** The "Graph" switch in the header turns the selected element's page into a graph of its relations (Graph Concept). This is a view mode, so it is a query parameter (`?view=graph`) and not a separate route. It stays on when you select another element in the tree. The item definition diagram (React Flow) is the Definition tab of an item.

## Open questions

1. **Auth and session:** token handling, the login flow and route guards depend on the IAM decision (#46).
2. **Language:** English only, or German as well?
3. **Read-only sharing:** is a public read-only link per project wanted?
4. **Archive:** the project list wireframe has an "Archive" entry. Separate route (`/projects/archive`) or a filter on `/projects`?
5. **Unassigned elements:** "Flexible Definition" in the wireframes adds an "Unassigned" group to the tree for elements without a parent. They still get the same flat URLs, so no extra route is needed.
