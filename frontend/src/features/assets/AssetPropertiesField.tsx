import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { AssetRelations, CiaProperty } from '../../api/models/asset'
import type { EntityRef } from '../../api/models/tree'
import { formatEntityId } from '../workspace/entities'
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
  return entities.map((entity) => formatEntityId(entity.code)).join(', ')
}

/** Part of the Definition form ("Asset Definition" wireframe): the declared cybersecurity properties [RQ-15-02, WP-15-02]. */
export function AssetPropertiesField({ idPrefix, value, onChange, relations, relationsPath }: AssetPropertiesFieldProps) {
  const { t } = useTranslation()
  return (
    <fieldset className="overflow-hidden rounded-lg border">
      <legend className="sr-only">{t('ui:cybersecurityProperties')}</legend>
      <div aria-hidden="true" className="flex flex-wrap items-baseline gap-x-2 border-b bg-muted/50 px-4 py-2">
        <span className="text-sm font-medium">{t('ui:cybersecurityProperties')}</span>
        <span className="text-xs text-muted-foreground">{t('ui:assetPage.propertiesHint')}</span>
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
                  {t(label)}
                </label>
              </div>
              <div className="grid gap-1">
                {current.declared && (
                  <Input
                    aria-label={t('ui:assetPage.propertyDescription', { property: t(label) })}
                    value={current.description}
                    placeholder={t('ui:assetPage.propertyDescriptionPlaceholder')}
                    onChange={(event) => onChange(property, { ...current, description: event.target.value })}
                  />
                )}
                <p id={usageId} className="text-xs text-muted-foreground">
                  {!current.declared ? (
                    t('ui:assetPage.notDeclared')
                  ) : damageScenarios.length === 0 ? (
                    t('ui:assetPage.leadsToNothing')
                  ) : (
                    <>
                      {threats.length > 0
                        ? t('ui:assetPage.leadsToTargeted', { codes: codes(damageScenarios), threats: codes(threats) })
                        : t('ui:assetPage.leadsTo', { codes: codes(damageScenarios) })}{' '}
                      <Link to={relationsPath} className="underline">
                        {t('ui:assetPage.removeLinksFirst')}
                      </Link>
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
