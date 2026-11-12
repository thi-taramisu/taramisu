import { Link } from 'react-router-dom'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { AssetRelations, CiaProperty } from '../../api/models/asset'
import type { EntityRef } from '../../api/models/tree'
import { CIA_PROPERTIES } from './ciaProperties'

/** One C / I / A property in the form; `description` is kept while the property is not declared. */
export interface PropertyValue {
  declared: boolean
  description: string
}

export type PropertyValues = Record<CiaProperty, PropertyValue>

interface AssetPropertiesFieldProps {
  idPrefix: string
  value: PropertyValues
  onChange: (property: CiaProperty, value: PropertyValue) => void
  relations: AssetRelations
  relationsPath: string
}

function codes(entities: EntityRef[]) {
  return entities.map((entity) => entity.code).join(', ')
}

/** Part of the Definition form ("Asset Definition" wireframe): the declared cybersecurity properties [RQ-15-02, WP-15-02]. */
export function AssetPropertiesField({ idPrefix, value, onChange, relations, relationsPath }: AssetPropertiesFieldProps) {
  return (
    <fieldset className="overflow-hidden rounded-lg border">
      <legend className="sr-only">Cybersecurity Properties</legend>
      <div aria-hidden="true" className="flex flex-wrap items-baseline gap-x-2 border-b bg-muted/50 px-4 py-2">
        <span className="text-sm font-medium">Cybersecurity Properties</span>
        <span className="text-xs text-muted-foreground">whose loss can lead to a damage scenario (RQ-15-02)</span>
      </div>
      <ul className="divide-y">
        {CIA_PROPERTIES.map(({ value: property, label }) => {
          const current = value[property]
          const damageScenarios = relations.damageScenarios.filter((ds) => ds.linkedProperties.includes(property))
          const threats = relations.threatScenarios.filter((ts) => ts.targetedProperties.includes(property))
          // Removing a property would remove its links, so they are removed on the Relations tab first.
          const locked = current.declared && damageScenarios.length > 0
          const checkboxId = `${idPrefix}-${property}`
          const usageId = `${checkboxId}-usage`
          return (
            <li key={property} className="grid gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={checkboxId}
                  checked={current.declared}
                  aria-disabled={locked}
                  aria-describedby={usageId}
                  className={locked ? 'opacity-70' : undefined}
                  onCheckedChange={(checked) => {
                    if (!locked) onChange(property, { ...current, declared: checked === true })
                  }}
                />
                <label htmlFor={checkboxId} className="text-sm font-medium">
                  <span aria-hidden="true" className="mr-1.5 font-mono text-muted-foreground">
                    {property}
                  </span>
                  {label}
                </label>
              </div>
              <div className="grid gap-1">
                {current.declared && (
                  <Input
                    aria-label={`${label} description`}
                    value={current.description}
                    placeholder="Why this property matters for the asset"
                    onChange={(event) => onChange(property, { ...current, description: event.target.value })}
                  />
                )}
                <p id={usageId} className="text-xs text-muted-foreground">
                  {!current.declared ? (
                    'Not declared.'
                  ) : damageScenarios.length === 0 ? (
                    'Leads to no damage scenario yet.'
                  ) : (
                    <>
                      Leads to {codes(damageScenarios)}
                      {threats.length > 0 && <> · targeted by {codes(threats)}</>}.{' '}
                      <Link to={relationsPath} className="underline">
                        Remove the links on the Relations tab
                      </Link>{' '}
                      to remove the property.
                    </>
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
