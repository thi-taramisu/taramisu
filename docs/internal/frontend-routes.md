# Frontend routes

Status: implemented with placeholder pages (#30). The routes follow the wireframes in the [Whimsical concept
board](https://whimsical.com/taramisu-concept-MeRaRm6cqUmmG6KBFgjiim), sections "Concept 2: Hierarchical Workspace with Relations" and
"Graph Concept". Backend endpoints are out of scope here.

The additional design reference routes are `/design-system/colors` (all schemes) and `/design-system/colors/:schemeId` (`neutral`, `ocean`,
`iris`). The project list and workspace link to them. Pages and Filetree navigation render in the browser through React Router.
Deployment serves the static Vite build with an SPA fallback; see the [frontend README](../../frontend/README.md#client-rendering-and-deployment).

The interface supports English and German through the header's language selector (#256; [ADR 0004](adr/0004-frontend-internationalization.md)).
Working navigation, dialogs, forms, validation, and accessibility labels use translations, including controls backed by mock services.
Stored data, internal design previews, demo diagrams, and unfinished-feature placeholders remain unchanged.
Switching language keeps the same URLs and entered values. Authentik manages its own language separately.

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
The local graph prototype (#184) adds a relation view for every element via `?view=graph`, with
`&graphMode=minimal` for compact node labels. Other unimplemented views render placeholders.
Items come from the item API in `frontend/src/api/`, an in-memory mock
(`frontend/src/api/mocks/`) seeded with the headlamp example (`frontend/src/api/mocks/data/headlamp.ts`, project id `headlamp`) until the
item routes (#83) are in `backend/openapi.json`. The tab list per element type is in `frontend/src/features/workspace/entities.ts`.

The damage scenario Relations tab (#185) links assets (with C / I / A) and threat scenarios of the owning item through the mock API. It is
built from `frontend/src/features/relations/`, which the threat scenario and attack path Relations tabs can reuse. Elements without a
link upwards are listed in the "Unassigned" section of their item (#258) until they are linked.

The threat scenario page (#194) has the Definition tab (name, cause, elicitation, technical notes, targets) and the Relations tab (damage
scenarios, attack paths), both on the mock API. Its Risks tab calculates the risk values with the
risk matrix from the impact of the linked damage scenarios and the most feasible linked attack path. Treatment is still a placeholder.

The attack path page (#195) has the Definition tab (name, analysis approach, partial flag, steps), the Rating tab (attack potential with
the five factors, total and feasibility) and the Relations tab (threat scenarios), all on the mock API.

Threat scenarios and attack paths are created in the "New Threat Scenario" and "New Attack Path" dialogs (#332), from "+ New" or from
"Create new …" on a Relations tab (with the item fixed). Both ask for the name, the item and the elements one level up: damage scenarios for
a threat scenario, threat scenarios for an attack path. On the page of such an element, the dialog starts linked to it. At least one link is
required, as for damage scenarios, because the tree has no place for unlinked elements yet; for the same reason, only elements that are in
the tree can be linked. The other fields follow on the element's page. The dialogs share `CreateLinkedElementDialog` and the item and "Link
to" fields in `frontend/src/features/workspace/`.

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
6. **Unassigned elements?** "Flexible Definition" in the wireframes adds an "Unassigned" section to each item in the tree for elements
   without a link upwards (#258). They keep the same flat URLs, so no extra route is needed. The breadcrumbs show
   "Unassigned" as a step without a link between the item and the element.

## Open questions

1. **Auth and session:** token handling, the login flow and route guards depend on the IAM decision (#46).
2. **Read-only sharing:** is a public read-only link per project wanted?
3. **Archive:** the project list wireframe has an "Archive" entry. Separate route (`/projects/archive`) or a filter on `/projects`?

## Local graph prototype (#184)

The graph is centered on the entity in the route. Selecting a node opens its details with **Edit**,
**Jump to**, and links to its other neighbors. Jumping changes the route and preserves the graph mode;
Edit opens the normal detail page (some entity editors are still placeholders). The tree also preserves
the display mode. The normal and minimal variants share the same entities and relations.

The graph reads current mock services via `useRelationGraph`, deduplicates shared tree occurrences, and
merges relations from the risk rows. Attack paths point to threats, which point to damage scenarios.
A threat view also includes the linked asset as context. New damage scenarios and saved names are
reflected after the existing project-query invalidation. Failed requests show an error and Retry,
rather than presenting incomplete data as a valid empty graph.

Colors use the existing risk 1–5 tokens. Edges use the highest explicit risk row for that relation;
node colors summarize their highest incident rated relation. An attack path receives a score only
when its display code is explicitly referenced by a risk row. Unrated relations remain neutral and
dashed. Impact and feasibility labels are not converted into invented risk scores. These are mock
assessments, not a validated risk calculation. The sample data currently rates only AP-02 with risk 4.

The first version starts with a neighborhood layout and supports dragging individual nodes, pan, zoom and Fit.
Positions are kept in component state per focused element across normal/minimal mode changes; reloading resets them.
**Reset layout** restores the default positions and fits the graph. Dragging does not open node details.
The canvas handles pointer updates internally and saves positions when the drag ends. Connection ports
are determined by the default relation layout and remain fixed when nodes move, including across a neighbor.
Moving a node never changes the source/target entities, arrow direction, or risk of a relation.
It does not edit relations, calculate risk, persist layout, or connect to a graph backend. It is a local prototype for wireframe review.
