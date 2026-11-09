import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { CiaProperty } from '../../api/models/asset'
import type { ThreatScenarioRelations, ThreatTarget } from '../../api/models/threatScenario'
import { CIA_PROPERTIES } from '../assets/ciaProperties'
import { TARGET_SELECTION, isSameTarget, toggleTarget, type TargetSelection } from './targetSelection'

interface ThreatTargetsFieldProps {
  damageScenarios: ThreatScenarioRelations['damageScenarios']
  value: ThreatTarget[]
  onChange: (targets: ThreatTarget[]) => void
  /** Where to link the damage scenarios that offer the targets. */
  relationsPath: string
  selection?: TargetSelection
}

function propertyLabel(property: CiaProperty) {
  return CIA_PROPERTIES.find((p) => p.value === property)?.label
}

/** Part of the Definition form: per linked damage scenario, its causes among which the threat names the targets [RQ-15-03]. */
export function ThreatTargetsField({ damageScenarios, value, onChange, relationsPath, selection = TARGET_SELECTION }: ThreatTargetsFieldProps) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm font-medium">Targeted Assets and Compromised Properties</legend>
      {damageScenarios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The targets come from the linked damage scenarios.{' '}
          <Link to={relationsPath} className="underline">
            Link a damage scenario on the Relations tab
          </Link>
          .
        </p>
      ) : (
        damageScenarios.map((scenario) => <DamageScenarioTargets key={scenario.id} scenario={scenario} value={value} onChange={onChange} selection={selection} />)
      )}
    </fieldset>
  )
}

interface DamageScenarioTargetsProps {
  scenario: ThreatScenarioRelations['damageScenarios'][number]
  value: ThreatTarget[]
  onChange: (targets: ThreatTarget[]) => void
  selection: TargetSelection
}

function DamageScenarioTargets({ scenario, value, onChange, selection }: DamageScenarioTargetsProps) {
  const groupId = useId()
  const single = selection === 'one-per-asset'
  const { causes } = scenario

  return (
    <fieldset className="overflow-hidden rounded-lg border">
      <legend className="sr-only">
        {scenario.code} {scenario.name}
      </legend>
      <div aria-hidden="true" className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2 text-sm">
        <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{scenario.code}</span>
        <span className="min-w-0 flex-1 truncate font-medium" title={scenario.name}>
          {scenario.name}
        </span>
      </div>
      {causes.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No asset leads to this damage scenario yet.</p>}
      <div className="divide-y">
        {causes.map(({ asset, property }, index) => {
          const target = { assetId: asset.id, property }
          const checked = value.some((t) => isSameTarget(t, target))
          const toggle = () => onChange(toggleTarget(value, target, selection))
          // A target from another damage scenario has no entry in this group, but choosing one here would replace it.
          const elsewhere = single && causes.findIndex((c) => c.asset.id === asset.id) === index
            ? value.find((t) => t.assetId === asset.id && !causes.some((c) => c.asset.id === asset.id && c.property === t.property))
            : undefined
          return (
            <label key={`${asset.id}:${property}`} className="flex min-h-10 cursor-pointer items-center gap-2 px-4 py-1.5 text-sm hover:bg-muted/30 has-checked:bg-muted/50">
              <input
                type={single ? 'radio' : 'checkbox'}
                name={`${groupId}-${asset.id}`}
                checked={checked}
                onChange={toggle}
                // A checked radio button fires no change event, and a threat can also have no target yet.
                onClick={() => {
                  if (single && checked) toggle()
                }}
              />
              <span
                aria-hidden="true"
                className={`inline-flex size-6 shrink-0 items-center justify-center rounded-lg border font-mono ${
                  checked ? 'border-primary bg-primary text-primary-foreground' : 'border-dashed text-muted-foreground'
                }`}
              >
                {property}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs text-muted-foreground">{asset.code}</span> {asset.name}{' '}
                <span className="text-muted-foreground">· {propertyLabel(property)}</span>
              </span>
              {elsewhere && <span className="shrink-0 text-xs text-muted-foreground">Currently: {propertyLabel(elsewhere.property)}</span>}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
