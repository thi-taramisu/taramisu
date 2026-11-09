import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { isNotFound } from '../../api/errors'
import type { EntityType } from '../../api/models/tree'
import { ENTITY_TYPES, entityTitle } from './entities'
import { EntityPage } from './EntityPage'

interface EntityDataPageProps {
  type: EntityType
  projectId: string
  entity: UseQueryResult<{ code: string; title: string }>
  tabCounts?: Record<string, number>
}

/** Page of an element loaded from its API, with the not-found, loading and error states around `EntityPage`. */
export function EntityDataPage({ type, projectId, entity, tabCounts }: EntityDataPageProps) {
  const { label } = ENTITY_TYPES[type]
  const noun = label.toLowerCase()

  if (isNotFound(entity.error)) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{label} not found</h1>
        <p className="text-sm text-muted-foreground">The {noun} does not exist or was deleted.</p>
        <Link to={`/projects/${projectId}`} className="text-sm hover:underline">
          Back to project
        </Link>
      </div>
    )
  }
  if (!entity.data) {
    return entity.isError ? (
      <p role="alert" className="text-sm text-destructive">The {noun} could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading {noun}…</output>
    )
  }

  return (
    <EntityPage
      type={type}
      title={entityTitle({ code: entity.data.code, name: entity.data.title })}
      tabCounts={tabCounts}
      actions={
        // A failed refetch keeps the loaded element, so unsaved edits in the tabs survive.
        entity.isError && (
          <p role="alert" className="self-center text-sm text-destructive">
            The {noun} could not be refreshed.
          </p>
        )
      }
    />
  )
}
