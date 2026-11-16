import { useTranslation } from 'react-i18next'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { isNotFound } from '../../api/errors'
import type { EntityType } from '../../api/models/tree'
import { EntityPage } from './EntityPage'

interface EntityDataPageProps {
  type: EntityType
  projectId: string
  entity: UseQueryResult<{ code: string; title: string }>
  tabCounts?: Record<string, number>
}

/** Page of an element loaded from its API, with the not-found, loading and error states around `EntityPage`. */
export function EntityDataPage({ type, projectId, entity, tabCounts }: EntityDataPageProps) {
  const { t, i18n } = useTranslation()
  const label = t(`entities.${type}`)
  const noun = i18n.resolvedLanguage === 'de' ? label : label.toLowerCase()

  if (isNotFound(entity.error)) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t('ui:entityNotFound', { type: label })}</h1>
        <p className="text-sm text-muted-foreground">{t('ui:entityMissing', { type: noun })}</p>
        <Link to={`/projects/${projectId}`} className="text-sm hover:underline">
          {t('navigation.backToProject')}
        </Link>
      </div>
    )
  }
  if (!entity.data) {
    return entity.isError ? (
      <p role="alert" className="text-sm text-destructive">{t('ui:loadEntityError', { type: noun })}</p>
    ) : (
      <output className="text-sm text-muted-foreground">{t('ui:loadingEntity', { type: noun })}</output>
    )
  }

  return (
    <EntityPage
      type={type}
      name={entity.data.title}
      code={entity.data.code}
      tabCounts={tabCounts}
      actions={
        // A failed refetch keeps the loaded element, so unsaved edits in the tabs survive.
        entity.isError && (
          <p role="alert" className="self-center text-sm text-destructive">
            {t('ui:refreshEntityError', { type: noun })}
          </p>
        )
      }
    />
  )
}
