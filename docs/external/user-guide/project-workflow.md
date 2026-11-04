---
title: Project workflow
sidebar_position: 1
---

:::info Current implementation status
The project management interface is currently a frontend preview using
mock data. Project changes are not persisted across page reloads.

The TARA assessment workflow and underlying data model are still under
discussion. This guide does not define a normative ISO/SAE 21434 process.
:::

## Project overview

The TARAmisu Main Page provides an initial interface for organizing
and managing TARA projects.

The page contains three main sections:

- **Favorites:** Projects marked as favorites.
- **All Projects:** All currently active projects.
- **Archive:** Projects that have been archived.

The sidebar can be expanded or collapsed.

The Search entry is currently a placeholder.

## Creating a project

1. Open the Projects page.
2. Select **Create Project** in the sidebar.
3. Enter a project name.
4. Select **Create** or press Enter.

A project name is required. Empty names and names containing only
whitespace are rejected.

The new project appears in the active project overview.

:::note Temporary data
New projects are currently stored only in frontend state.
They disappear when the page is reloaded.
:::

## Managing favorites

Each active project provides a star button.

- Select the star to add a project to Favorites.
- Select it again to remove the project from Favorites.

Favorited projects are displayed separately from the full list
of active projects.

Archived projects are not shown in the Favorites section.

## Archiving a project

1. Locate the project in the active project overview.
2. Open its action menu.
3. Select **Archive Project**.

The project is removed from the active overview and appears in
the Archive view.

### Restoring a project

1. Open **Archive** from the sidebar.
2. Locate the archived project.
3. Select **Restore Project**.

The project returns to the active overview.

Its previous favorite status is preserved.

## Deleting a project

1. Locate the project in the active project overview.
2. Open its action menu.
3. Select **Delete Project**.
4. Confirm the action in the confirmation dialog.

Select **Cancel** to keep the project.

Deletion currently affects only temporary frontend state.

## Opening a project workspace

The Headlamp example project provides navigation to the existing
TARAmisu workspace.

Other mock projects are displayed in the overview but do not
yet provide functional workspace navigation.

The Headlamp example is protected from deletion and archiving
in the current preview.

## Known limitations

The current frontend preview has the following limitations:

- Project data is not persisted.
- Backend project management APIs are not yet connected.
- Search is not functional.
- Only the Headlamp example has a functional workspace.
- The Archive view does not have a dedicated URL.
- Project management actions use temporary React state.

These limitations do not represent the final intended application behavior.

## Further documentation

The assessment workflow will be documented as additional functionality
becomes available, including assessment context, assets, threat scenarios,
damage scenarios, attack paths, and review processes.

Assessment methods and terminology require validation against the
project's ISO/SAE 21434 mapping before being presented as authoritative
guidance.

Related topics:

- [Sharing](sharing.md)
- [Import and export](import-export.md)
- [TARA context](../concepts/tara.md)
