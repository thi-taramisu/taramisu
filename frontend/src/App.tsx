import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AssetDefinitionTab } from './features/assets/AssetDefinitionTab'
import { AssetPage } from './features/assets/AssetPage'
import { AssetRelationsTab } from './features/assets/AssetRelationsTab'
import { AssetRisksTab } from './features/assets/AssetRisksTab'
import { ItemAssetsTab } from './features/assets/ItemAssetsTab'
import { AttackPathDefinitionTab } from './features/attack-paths/AttackPathDefinitionTab'
import { AttackPathPage } from './features/attack-paths/AttackPathPage'
import { AttackPathRatingTab } from './features/attack-paths/AttackPathRatingTab'
import { AttackPathRelationsTab } from './features/attack-paths/AttackPathRelationsTab'
import { DamageScenarioDefinitionTab } from './features/damage-scenarios/DamageScenarioDefinitionTab'
import { DamageScenarioImpactTab } from './features/damage-scenarios/DamageScenarioImpactTab'
import { DamageScenarioPage } from './features/damage-scenarios/DamageScenarioPage'
import { DamageScenarioRelationsTab } from './features/damage-scenarios/DamageScenarioRelationsTab'
import { ItemDefinitionTab } from './features/items/ItemDefinitionTab'
import { ItemPage } from './features/items/ItemPage'
import { ItemRisksTab } from './features/items/ItemRisksTab'
import { GeneralSettings } from './features/project-settings/GeneralSettings'
import { MembersSettings } from './features/project-settings/MembersSettings'
import { ThreatScenarioDefinitionTab } from './features/threat-scenarios/ThreatScenarioDefinitionTab'
import { ThreatScenarioPage } from './features/threat-scenarios/ThreatScenarioPage'
import { ThreatScenarioRelationsTab } from './features/threat-scenarios/ThreatScenarioRelationsTab'
import { ThreatScenarioRisksTab } from './features/threat-scenarios/ThreatScenarioRisksTab'
import type { EntityType } from './api/models/tree'
import { ENTITY_TYPES } from './features/workspace/entities'
import { EntityPage } from './features/workspace/EntityPage'
import { Placeholder } from './features/workspace/Placeholder'
import { WorkspaceLayout } from './features/workspace/WorkspaceLayout'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { ColorSchemesPage } from './pages/ColorSchemesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProjectListPage } from './pages/ProjectListPage'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'

// Element types with their own page (data from the API), everything else uses the generic page.
const PAGES: Partial<Record<EntityType, ReactNode>> = {
  items: <ItemPage />,
  assets: <AssetPage />,
  'damage-scenarios': <DamageScenarioPage />,
  'threat-scenarios': <ThreatScenarioPage />,
  'attack-paths': <AttackPathPage />,
}

// Tabs that already have content, everything else renders a placeholder.
const TAB_CONTENT: Partial<Record<`${EntityType}/${string}`, ReactNode>> = {
  'items/': <ItemDefinitionTab />,
  'items/assets': <ItemAssetsTab />,
  'items/risks': <ItemRisksTab />,
  'assets/': <AssetDefinitionTab />,
  'assets/risks': <AssetRisksTab />,
  'assets/relations': <AssetRelationsTab />,
  'damage-scenarios/': <DamageScenarioDefinitionTab />,
  'damage-scenarios/impact': <DamageScenarioImpactTab />,
  'damage-scenarios/relations': <DamageScenarioRelationsTab />,
  'threat-scenarios/': <ThreatScenarioDefinitionTab />,
  'threat-scenarios/risks': <ThreatScenarioRisksTab />,
  'threat-scenarios/relations': <ThreatScenarioRelationsTab />,
  'attack-paths/': <AttackPathDefinitionTab />,
  'attack-paths/rating': <AttackPathRatingTab />,
  'attack-paths/relations': <AttackPathRelationsTab />,
}

// Route concept: docs/internal/frontend-routes.md
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/design-sheet.html" element={<Navigate to="/design-system/colors" replace />} />
      <Route path="/design-system/colors" element={<ColorSchemesPage />} />
      <Route path="/design-system/colors/:schemeId" element={<ColorSchemesPage />} />
      <Route path="/projects" element={<ProjectListPage />} />
      <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />}>
        <Route index element={<GeneralSettings />} />
        <Route path="members" element={<MembersSettings />} />
      </Route>
      <Route path="/projects/:projectId" element={<WorkspaceLayout />}>
        <Route index element={<Placeholder title="Select an element in the tree" />} />
        {(Object.keys(ENTITY_TYPES) as EntityType[]).map((type) => (
          <Route key={type} path={`${type}/:entityId`} element={PAGES[type] ?? <EntityPage type={type} />}>
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
