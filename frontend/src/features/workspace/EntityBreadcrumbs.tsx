import { Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import type { TreeNode } from '../../api/models/tree'
import { entityPath, entityTitle, isUnassignedIn } from './entities'

/** Step for an item's "Unassigned" section, which has no page of its own. */
const UNASSIGNED = 'unassigned'

/** The path with an "Unassigned" step wherever the next element sits in that section of the item, as in the tree. */
function crumbsOf(path: readonly TreeNode[]): (TreeNode | typeof UNASSIGNED)[] {
  return path.flatMap((node, index) => {
    const next = path[index + 1]
    return next && isUnassignedIn(node, next.type, next.id) ? [node, UNASSIGNED] : [node]
  })
}

/** Data-driven relation path; wrapping keeps even long names fully accessible. */
export function EntityBreadcrumbs({ projectId, path }: { projectId: string; path: readonly TreeNode[] }) {
  const { t } = useTranslation()
  const { search } = useLocation()
  const crumbs = crumbsOf(path)

  return (
    <nav aria-label={t('ui:breadcrumbs')} className="text-sm">
      <ol className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {crumbs.map((crumb, index) => {
          const separator = index > 0 && <span aria-hidden="true" className="text-muted-foreground">/</span>
          if (crumb === UNASSIGNED) {
            return (
              <li key={UNASSIGNED} className="flex min-w-0 max-w-full items-baseline gap-2 text-muted-foreground">
                {separator}
                {/* Centered on the line while the text keeps the shared baseline of the trail. */}
                <Inbox aria-hidden="true" className="-mr-1 size-3.5 shrink-0 self-center" />
                <span>{t('navigation.unassigned')}</span>
              </li>
            )
          }
          const current = index === crumbs.length - 1
          const label = entityTitle(crumb)
          return (
            <li key={`${crumb.type}/${crumb.id}`} className="flex min-w-0 max-w-full items-baseline gap-2">
              {separator}
              {current ? (
                <span aria-current="page" className="min-w-0 font-medium wrap-anywhere">{label}</span>
              ) : (
                <Link
                  to={`${entityPath(projectId, crumb.type, crumb.id)}${search}`}
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
