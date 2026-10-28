import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom'
import { ENTITY_TYPES, type EntityType } from './entities'
import { findNode } from './exampleProject'
import { Placeholder } from './Placeholder'

/**
 * Page of one element (item, asset, ...) with its tabs as child routes.
 * With `?view=graph` it shows the relation graph instead (Graph Concept wireframes).
 */
export function EntityPage({ type }: { type: EntityType }) {
  const { entityId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { label, tabs } = ENTITY_TYPES[type]
  const node = findNode(type, entityId)

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <p className="text-xs text-muted-foreground uppercase">{label}</p>
        <h1 className="text-xl font-semibold">{node ? `${node.code} ${node.name}` : entityId}</h1>
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
                {tab.label}
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
