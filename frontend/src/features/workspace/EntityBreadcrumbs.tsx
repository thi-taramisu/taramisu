import { Link, useLocation } from 'react-router-dom'
import type { TreeNode } from '../../api/models/tree'
import { entityPath } from './entities'

/** Data-driven relation path; wrapping keeps even long names fully accessible. */
export function EntityBreadcrumbs({ projectId, path }: { projectId: string; path: readonly TreeNode[] }) {
  const { search } = useLocation()

  return (
    <nav aria-label="Breadcrumbs" className="text-sm">
      <ol className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {path.map((node, index) => {
          const current = index === path.length - 1
          const label = `${node.code || node.id} ${node.name}`
          return (
            <li key={`${node.type}/${node.id}`} className="flex min-w-0 max-w-full items-baseline gap-2">
              {index > 0 && <span aria-hidden="true" className="text-muted-foreground">/</span>}
              {current ? (
                <span aria-current="page" className="min-w-0 font-medium wrap-anywhere">{label}</span>
              ) : (
                <Link
                  to={`${entityPath(projectId, node.type, node.id)}${search}`}
                  className="min-w-0 text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-ring focus-visible:outline-2 wrap-anywhere"
                >
                  {label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
