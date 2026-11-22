import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Checkbox } from '@/components/ui/checkbox'
import type { ThreatScenarioRelations, ThreatTarget } from '../../api/models/threatScenario'
import { CIA_PROPERTIES } from '../assets/ciaProperties'
import { isSameTarget, toggleTarget } from './targetSelection'
import { formatEntityId } from '../workspace/entities'

interface ThreatTargetsFieldProps {
  damageScenarios: ThreatScenarioRelations['damageScenarios']
  value: ThreatTarget[]
  onChange: (targets: ThreatTarget[]) => void
  /** Where to link the damage scenarios that offer the targets. */
  relationsPath: string
}

/** Part of the Definition form: per linked damage scenario, its causes among which the threat names the targets [RQ-15-03]. */
export function ThreatTargetsField({ damageScenarios, value, onChange, relationsPath }: ThreatTargetsFieldProps) {
  const { t } = useTranslation()
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm font-medium">{t('ui:targetedAssets')}</legend>
      {damageScenarios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('ui:targetsSource')}{' '}
          <Link to={relationsPath} className="underline">
            {t('ui:linkTargetDamage')}
          </Link>
          .
        </p>
      ) : (
        damageScenarios.map((scenario) => <DamageScenarioTargets key={scenario.id} scenario={scenario} value={value} onChange={onChange} />)
      )}
    </fieldset>
  )
}

interface DamageScenarioTargetsProps {
  scenario: ThreatScenarioRelations['damageScenarios'][number]
  value: ThreatTarget[]
  onChange: (targets: ThreatTarget[]) => void
}

function DamageScenarioTargets({ scenario, value, onChange }: DamageScenarioTargetsProps) {
  const { t } = useTranslation()
  const { causes } = scenario

  return (
    <fieldset className="overflow-hidden rounded-lg border">
      <legend className="sr-only">
        {formatEntityId(scenario.code)} {scenario.name}
      </legend>
      <div aria-hidden="true" className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2 text-sm">
        <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{formatEntityId(scenario.code)}</span>
        <span className="min-w-0 flex-1 truncate font-medium" title={scenario.name}>
          {scenario.name}
        </span>
      </div>
      {causes.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">{t('ui:noDamageAssets')}</p>}
      <div className="divide-y">
        {causes.map(({ asset, property }) => {
          const target = { assetId: asset.id, property }
          const checked = value.some((entry) => isSameTarget(entry, target))
          const toggle = () => onChange(toggleTarget(value, target))
          return (
            <label key={`${asset.id}:${property}`} className="flex min-h-10 cursor-pointer items-center gap-2 px-4 py-1.5 text-sm hover:bg-muted/30 has-checked:bg-muted/50">
              <Checkbox checked={checked} onCheckedChange={toggle} />
              <span
                aria-hidden="true"
                className={`inline-flex size-6 shrink-0 items-center justify-center rounded-lg border font-mono ${
                  checked ? 'border-primary bg-primary text-primary-foreground' : 'border-dashed text-muted-foreground'
                }`}
              >
                {property}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs text-muted-foreground">{formatEntityId(asset.code)}</span> {asset.name}{' '}
                <span className="text-muted-foreground">· {t(CIA_PROPERTIES.find((p) => p.value === property)?.label ?? property)}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
