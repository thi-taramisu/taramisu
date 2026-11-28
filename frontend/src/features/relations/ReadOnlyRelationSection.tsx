import { useId, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { EntityType } from '../../api/models/tree'
import { entityPath } from '../workspace/entities'
import type { RelationEntry } from './AddRelationDialog'

interface ReadOnlyRelationSectionProps {
  projectId: string
  type: EntityType
  direction: 'up' | 'down'
  title: string
  /** Where these links are changed, shown below the heading. */
  hint: ReactNode
  rows: RelationEntry[]
  emptyText: string
}

/** Block of a Relations tab whose links are derived or changed elsewhere, so it has no add or remove. */
export function ReadOnlyRelationSection({ projectId, type, direction, title, hint, rows, emptyText }: ReadOnlyRelationSectionProps) {
  const headingId = useId()
  const Arrow = direction === 'up' ? ArrowUp : ArrowDown
  const directionHint = direction === 'up' ? 'Above in the hierarchy' : 'Below in the hierarchy'

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/50 px-4 py-2">
        <span title={directionHint}>
          <Arrow aria-hidden="true" className="size-4" />
          <span className="sr-only">{directionHint}</span>
        </span>
        <h2 id={headingId} className="text-sm font-medium">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{row.code}</span>
              <div className="min-w-0 flex-1 truncate text-sm">
                <Link to={entityPath(projectId, type, row.id)} title={row.name} className="hover:underline">
                  {row.name}
                </Link>
              </div>
              {row.details}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
