import { Link, useParams } from 'react-router-dom'
import { isNotFound } from '../../api/errors'
import { useDamageScenario } from '../../api/queries/items'
import { EntityPage } from '../workspace/EntityPage'
import { useTranslation } from 'react-i18next'

/** Damage scenario page: header from the damage scenario API, tabs as child routes. */
export function DamageScenarioPage() {
  const { t } = useTranslation()
  const { projectId = '', entityId = '' } = useParams()
  const scenario = useDamageScenario(projectId, entityId)

  if (isNotFound(scenario.error)) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t('ui:damageNotFound')}</h1>
        <p className="text-sm text-muted-foreground">{t('ui:damageMissing')}</p>
        <Link to={`/projects/${projectId}`} className="text-sm hover:underline">
          {t('navigation.backToProject')}
        </Link>
      </div>
    )
  }
  if (!scenario.data) {
    return scenario.isError ? (
      <p role="alert" className="text-sm text-destructive">{t('ui:loadDamageError')}</p>
    ) : (
      <output className="text-sm text-muted-foreground">{t('ui:loadingDamage')}</output>
    )
  }

  return (
    <EntityPage
      type="damage-scenarios"
      name={scenario.data.title}
      code={scenario.data.code}
      actions={
        // A failed refetch keeps the loaded damage scenario, so unsaved edits in the tabs survive.
        scenario.isError && (
          <p role="alert" className="self-center text-sm text-destructive">
            {t('ui:refreshDamageError')}
          </p>
        )
      }
    />
  )
}
