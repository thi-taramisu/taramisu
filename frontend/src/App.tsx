import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ItemAssetsTab } from './features/assets/ItemAssetsTab'
import { ItemDefinitionFlow } from './features/item-definition/ItemDefinitionFlow'
import { ENTITY_TYPES, type EntityType } from './features/workspace/entities'
import { EntityPage } from './features/workspace/EntityPage'
import { Placeholder } from './features/workspace/Placeholder'
import { WorkspaceLayout } from './features/workspace/WorkspaceLayout'
import { ColorSchemesPage } from './pages/ColorSchemesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProjectListPage } from './pages/ProjectListPage'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'

// Tabs that already have content, everything else renders a placeholder.
const TAB_CONTENT: Partial<Record<`${EntityType}/${string}`, ReactNode>> = {
  'items/': <ItemDefinitionFlow />,
  'items/assets': <ItemAssetsTab />,
}

// Route concept: docs/internal/frontend-routes.md
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/design-sheet.html" element={<Navigate to="/design-system/colors" replace />} />
      <Route path="/design-system/colors" element={<ColorSchemesPage />} />
      <Route path="/design-system/colors/:schemeId" element={<ColorSchemesPage />} />
      <Route path="/projects" element={<ProjectListPage />} />
      <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />}>
        <Route index element={<Placeholder title="General" />} />
        <Route path="members" element={<Placeholder title="Members" />} />
      </Route>
      <Route path="/projects/:projectId" element={<WorkspaceLayout />}>
        <Route index element={<Placeholder title="Select an element in the tree" />} />
        {(Object.keys(ENTITY_TYPES) as EntityType[]).map((type) => (
          <Route key={type} path={`${type}/:entityId`} element={<EntityPage type={type} />}>
            {ENTITY_TYPES[type].tabs.map(({ path, label }) => {
              const element = TAB_CONTENT[`${type}/${path}`] ?? <Placeholder title={label} />
              return path ? (
                <Route key={path} path={path} element={element} />
              ) : (
                <Route key="index" index element={element} />
              )
            })}
          </Route>
        ))}
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
