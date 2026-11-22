import { useTranslation } from 'react-i18next'
import type { UseQueryResult } from '@tanstack/react-query'

/** Loading and error states of the relations of an element; shows nothing while they are fine. */
export function RelationsQueryStatus({ query }: { query: Pick<UseQueryResult<unknown>, 'data' | 'isError'> }) {
  const { t } = useTranslation()
  if (query.data) {
    return query.isError ? <p role="alert" className="text-sm text-destructive">{t('ui:refreshRelationsError')}</p> : null
  }
  return query.isError ? (
    <p role="alert" className="text-sm text-destructive">{t('ui:loadRelationsError')}</p>
  ) : (
    <output className="text-sm text-muted-foreground">{t('ui:loadingRelations')}</output>
  )
}
