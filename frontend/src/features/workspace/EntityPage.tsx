import type { ReactNode } from 'react'
import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom'
import { useProjectTree } from '../items/queries'
import { ENTITY_TYPES, entityTitle, type EntityType } from './entities'
import { findNode } from './exampleProject'
import { Placeholder } from './Placeholder'

interface EntityPageProps {
  type: EntityType
  /** Heading; defaults to code and name of the element in the project tree. */
  title?: string
  /** Buttons on the right of the header, e.g. delete. */
  actions?: ReactNode
  /** Tab labels by tab path, e.g. to show a count. */
  tabLabels?: Record<string, string>
}

/**
 * Page of one element (item, asset, ...) with its tabs as child routes.
 * With `?view=graph` it shows the relation graph instead (Graph Concept wireframes).
 */
export function EntityPage({ type, title, actions, tabLabels = {} }: EntityPageProps) {
  const { projectId = '', entityId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { data: tree } = useProjectTree(projectId)
  const { label, tabs } = ENTITY_TYPES[type]
  const node = tree && findNode(type, entityId, tree)

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground uppercase">{label}</p>
          <h1 className="text-xl font-semibold">{title ?? (node ? entityTitle(node) : entityId)}</h1>
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
