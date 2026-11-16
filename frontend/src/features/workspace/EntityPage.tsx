import type { ReactNode } from 'react'
import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom'
import { useProjectTree } from '../../api/queries/items'
import type { EntityType } from '../../api/models/tree'
import { ENTITY_TYPES, findNode, formatEntityId } from './entities'
import { Placeholder } from './Placeholder'
import { useTranslation } from 'react-i18next'

interface EntityPageProps {
  type: EntityType
  /** Heading; defaults to the name of the element in the project tree. */
  name?: string
  /** Display ID such as DS-01, shown as #01 next to the type; defaults to the code in the project tree. */
  code?: string
  /** Buttons on the right of the header, e.g. delete. */
  actions?: ReactNode
  /** Tab labels by tab path, e.g. to show a count. */
  tabLabels?: Record<string, string>
  /** Numbers shown in a circle after the tab label, by tab path. */
  tabCounts?: Record<string, number>
}

/**
 * Page of one element (item, asset, ...) with its tabs as child routes.
 * With `?view=graph` it shows the relation graph instead (Graph Concept wireframes).
 */
export function EntityPage({ type, name, code, actions, tabLabels = {}, tabCounts = {} }: EntityPageProps) {
  const { t, i18n } = useTranslation()
  const { projectId = '', entityId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { data: tree } = useProjectTree(projectId)
  const { tabs } = ENTITY_TYPES[type]
  const label = t(`entities.${type}`)
  const node = tree && findNode(type, entityId, tree)
  // `||`, not `??`: an empty code from the API (not assigned yet) falls back to the tree node's code.
  const displayCode = code || node?.code
  const typeAndId = displayCode ? `${label} ${formatEntityId(displayCode)}` : label

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tabular-nums text-muted-foreground">{typeAndId}</p>
          <h1 className="text-xl font-semibold">
            {name ?? node?.name ?? entityId}
            {/* Keeps the ID in the heading's accessible name for heading navigation; the line above shows it visually. */}
            {displayCode && <span className="sr-only">, {typeAndId}</span>}
          </h1>
        </div>
        {actions}
      </div>
      {searchParams.get('view') === 'graph' ? (
        <Placeholder title="Graph view" />
      ) : (
        <>
          <nav aria-label={t('navigation.entityTabs', { type: label })} className="flex flex-wrap gap-4 border-b">
            {tabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                end
                className={({ isActive }) =>
                  `-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2 text-sm ${isActive ? 'border-primary font-medium' : 'border-transparent text-muted-foreground'}`
                }
              >
                {tabLabels[tab.path] ?? t(`navigation.tabs.${tab.path || 'definition'}`)}{' '}
                {tabCounts[tab.path] !== undefined && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-xs tabular-nums">
                    {tabCounts[tab.path].toLocaleString(i18n.resolvedLanguage)}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </>
      )}
    </div>
  )
}
