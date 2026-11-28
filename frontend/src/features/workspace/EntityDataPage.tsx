import { useTranslation } from 'react-i18next'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { isNotFound } from '../../api/errors'
import type { EntityType } from '../../api/models/tree'
import { formatEntityId } from './entities'
import { EntityPage } from './EntityPage'

interface EntityDataPageProps {
  type: EntityType
  projectId: string
  /** Scenarios and attack paths have a title, assets a name. */
  entity: UseQueryResult<{ code: string } & ({ title: string } | { name: string })>
  tabCounts?: Record<string, number>
  actions?: ReactNode
}

/** Page of an element loaded from its API, with the not-found, loading and error states around `EntityPage`. */
export function EntityDataPage({ type, projectId, entity, tabCounts, actions }: EntityDataPageProps) {
  const { t } = useTranslation()

  if (isNotFound(entity.error)) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t(`ui:entityStates.${type}.notFound`)}</h1>
        <p className="text-sm text-muted-foreground">{t(`ui:entityStates.${type}.missing`)}</p>
        <Link to={`/projects/${projectId}`} className="text-sm hover:underline">
          {t('navigation.backToProject')}
        </Link>
      </div>
    )
  }
  if (!entity.data) {
    return entity.isError ? (
      <p role="alert" className="text-sm text-destructive">{t(`ui:entityStates.${type}.loadError`)}</p>
    ) : (
      <output className="text-sm text-muted-foreground">{t(`ui:entityStates.${type}.loading`)}</output>
    )
  }

  return (
    <EntityPage
      type={type}
      name={'title' in entity.data ? entity.data.title : entity.data.name}
      code={formatEntityId(entity.data.code)}
      tabCounts={tabCounts}
      actions={
        <>
          {/* A failed refetch keeps the loaded element, so unsaved edits in the tabs survive. */}
          {entity.isError && (
            <p role="alert" className="self-center text-sm text-destructive">
              {t(`ui:entityStates.${type}.refreshError`)}
            </p>
          )}
          {actions}
        </>
      }
    />
  )
}
