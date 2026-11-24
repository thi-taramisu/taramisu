import { useTranslation } from 'react-i18next'
import { useHealth } from '../../api/queries/backend'

/** Example of a typed, cached call to the real backend: `GET /health/live` via openapi-react-query. */
export function ApiStatus() {
  const { t } = useTranslation()
  const { data, error, isPending } = useHealth()

  if (isPending) return <p>{t('ui:backendPending')}</p>
  if (error) return <p>{t('ui:backendError', { detail: error.detail ?? error.title })}</p>
  return <p>{t('ui:backendStatus', { status: data.status })}</p>
}
