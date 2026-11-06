import type { ReactNode } from 'react'
import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom'
import { useProjectTree } from '../../api/queries/items'
import type { EntityType } from '../../api/models/tree'
import { ENTITY_TYPES, findNode, formatEntityId } from './entities'
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
  const { data: tree } = useProjectTree(projectId)
  const { label, tabs } = ENTITY_TYPES[type]
  const node = tree && findNode(type, entityId, tree)
  const displayCode = code ?? node?.code

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            <span className="uppercase">{label}</span>
            {displayCode && <span className="ml-1.5 tabular-nums">{formatEntityId(displayCode)}</span>}
          </p>
          <h1 className="text-xl font-semibold">{name ?? node?.name ?? entityId}</h1>
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
