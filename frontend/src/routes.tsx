import type { ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import { ItemAssetsTab } from './features/assets/ItemAssetsTab'
import { ItemDefinitionDiagram } from './features/item-definition/ItemDefinitionDiagram'
import { ENTITY_TYPES, type EntityType } from './features/workspace/entities'
import { EntityPage } from './features/workspace/EntityPage'
import { Placeholder } from './features/workspace/Placeholder'
import { WorkspaceLayout } from './features/workspace/WorkspaceLayout'
import { ColorSchemesPage } from './pages/ColorSchemesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProjectListPage } from './pages/ProjectListPage'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'

const TAB_CONTENT: Partial<Record<`${EntityType}/${string}`, ReactNode>> = {
  'items/': <ItemDefinitionDiagram />,
  'items/assets': <ItemAssetsTab />,
}

// Shared by the browser router and server so rendering and HTTP status agree.
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/projects" replace /> },
  { path: '/design-sheet.html', element: <Navigate to="/design-system/colors" replace /> },
  { path: '/design-system/colors', element: <ColorSchemesPage /> },
  { path: '/design-system/colors/:schemeId', element: <ColorSchemesPage /> },
  { path: '/projects', element: <ProjectListPage /> },
  {
    path: '/projects/:projectId/settings', element: <ProjectSettingsPage />,
    children: [{ index: true, element: <Placeholder title="General" /> }, { path: 'members', element: <Placeholder title="Members" /> }],
  },
  {
    path: '/projects/:projectId', element: <WorkspaceLayout />,
    children: [
      { index: true, element: <Placeholder title="Select an element in the tree" /> },
      ...(Object.keys(ENTITY_TYPES) as EntityType[]).map((type): RouteObject => ({
        path: `${type}/:entityId`, element: <EntityPage type={type} />,
        children: ENTITY_TYPES[type].tabs.map(({ path, label }): RouteObject => {
          const element = TAB_CONTENT[`${type}/${path}`] ?? <Placeholder title={label} />
          return path ? { path, element } : { index: true, element }
        }),
      })),
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]
