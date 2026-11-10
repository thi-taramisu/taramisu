import type { ReactNode } from 'react'
import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom'
import { useProjectTree } from '../../api/queries/items'
import type { EntityType } from '../../api/models/tree'
import { ENTITY_TYPES, findNodePath, formatEntityId } from './entities'
import { EntityBreadcrumbs } from './EntityBreadcrumbs'
import { Placeholder } from './Placeholder'

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
}

/**
 * Page of one element (item, asset, ...) with its tabs as child routes.
 * With `?view=graph` it shows the relation graph instead (Graph Concept wireframes).
 */
export function EntityPage({ type, name, code, actions, tabLabels = {} }: EntityPageProps) {
  const { projectId = '', entityId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { data: tree, isPending } = useProjectTree(projectId)
  const { label, tabs } = ENTITY_TYPES[type]
  const path = tree && findNodePath(type, entityId, tree)
  const node = path?.at(-1)
  // `||`, not `??`: an empty code from the API (not assigned yet) falls back to the tree node's code.
  const displayCode = code || node?.code
  const typeAndId = displayCode ? `${label} ${formatEntityId(displayCode)}` : label

  return (
    <div className="flex h-full flex-col gap-4">
      <EntityBreadcrumbs projectId={projectId} path={path ?? [{
        type, id: entityId, name: isPending ? 'Loading…' : 'Path unavailable',
      }]} />
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
          <nav aria-label={`${label} tabs`} className="flex gap-4 border-b">
            {tabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                end
                className={({ isActive }) =>
                  `-mb-px border-b-2 pb-2 text-sm ${isActive ? 'border-primary font-medium' : 'border-transparent text-muted-foreground'}`
                }
              >
                {tabLabels[tab.path] ?? tab.label}
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
