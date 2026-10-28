# Main Page frontend implementation

## Related work

- Issue: #90
- Pull request: #120
- Status: Initial frontend preview, pending review and integration

## Purpose

The Main Page provides the initial project overview and basic
project management interactions for TARAmisu.

The implementation is based on the Main Page wireframe
and currently uses local mock data.

## Implemented features

- Application header
- Collapsible sidebar
- Favorites section
- Active project overview
- Project creation dialog
- Favorite management
- Project deletion with confirmation
- Project archiving and restoration
- Navigation to the Headlamp example workspace

## Implementation structure

The relevant components are located in the frontend:

| Component | Responsibility |
| --- | --- |
| `src/pages/ProjectListPage.tsx` | Main Page state and interactions |
| `src/components/layout/AppHeader.tsx` | Application header |
| `src/components/layout/AppSidebar.tsx` | Sidebar and view selection |
| `src/features/projects/ProjectCard.tsx` | Project card display |
| `src/features/projects/CreateProjectDialog.tsx` | Project creation |
| `src/features/projects/DeleteProjectDialog.tsx` | Deletion confirmation |
| `src/features/projects/mockProjects.ts` | Temporary project data |
| `src/components/ui/dropdown-menu.tsx` | Project action menu |

The implementation uses React, TypeScript, Tailwind CSS,
and shadcn/ui components.

## State management

Project data is initialized from local mock data.

Creating, deleting, favoriting, archiving, and restoring projects
modifies local React state.

No persistence mechanism is implemented in this feature.

The Headlamp example is protected from deletion and archiving
to preserve the existing example workspace.

## Navigation

The project overview is available at `/projects`.

The Headlamp example provides navigation to the existing workspace.

The Projects and Archive views are managed within the Main Page.
The Archive view currently has no dedicated URL.

Other mock projects do not provide functional workspace navigation.

## Accessibility

The project creation dialog supports:

- Submission through the Create button
- Submission through Enter in the project name field
- Closing through Cancel or Escape
- Focus restoration to the opening sidebar button
- Validation of empty and whitespace-only names

## Testing

The frontend test suite covers project creation, favorites,
deletion confirmation, archiving, restoration, and navigation.

Additional dialog tests cover form submission, validation,
and keyboard focus restoration.

Run the checks from the frontend directory:

    npm ci
    npm run build
    npm run lint
    npm test

## Current limitations

- Mock data only
- No persistent project storage
- No backend project management integration
- No functional search
- Workspace navigation only for the Headlamp example
- No dedicated Archive route

Backend integration and additional project management functionality
are separate follow-up work and are not part of this initial Main Page PR.
