import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { CiaProperty } from '../../api/models/asset'
import type { EntityRef } from '../../api/models/tree'
import { CIA_PROPERTIES } from './ciaProperties'

interface AssetPropertyTogglesProps {
  asset: Pick<EntityRef, 'code'> & { properties: CiaProperty[] }
  selected: CiaProperty[]
  onChange: (properties: CiaProperty[]) => void
  /** Ignores changes while a request runs; the focus stays on the button. */
  pending?: boolean
  /** Keeps the last selected property, for links that are already stored [RQ-15-02]. */
  requireOne?: boolean
  /** Also shows the properties the asset does not have, so C / I / A line up in a table. */
  showUnavailable?: boolean
}

/** C / I / A toggles of an asset link (DS Relation wireframe); only the properties the asset has can be linked. */
export function AssetPropertyToggles({ asset, selected, onChange, pending = false, requireOne = false, showUnavailable = false }: AssetPropertyTogglesProps) {
  const { t } = useTranslation()
  return (
    <fieldset className="flex gap-1">
      <legend className="sr-only">{t('ui:assetProperties', { code: asset.code })}</legend>
      {CIA_PROPERTIES.filter((p) => showUnavailable || asset.properties.includes(p.value)).map((p) => {
        if (!asset.properties.includes(p.value)) {
          const note = t('ui:unavailableAssetProperty', { property: t(p.label) })
          return (
            <span key={p.value} title={note} className="inline-flex size-6 items-center justify-center font-mono text-sm text-muted-foreground/50">
              <span aria-hidden="true">{p.value}</span>
              <span className="sr-only">{note}</span>
            </span>
          )
        }
        const pressed = selected.includes(p.value)
        const locked = requireOne && pressed && selected.length === 1
        return (
          <Button
            key={p.value}
            type="button"
            variant={pressed ? 'default' : 'outline'}
            size="icon-xs"
            className={`font-mono ${pressed ? '' : 'text-muted-foreground'} ${pending ? 'opacity-50' : ''}`}
            aria-pressed={pressed}
            aria-label={`${asset.code} ${t(p.label)}`}
            title={locked ? t('ui:keepLinkedProperty', { property: t(p.label) }) : t(p.label)}
            // aria-disabled keeps the full contrast and the explaining tooltip of a locked property.
            aria-disabled={pending || locked}
            onClick={() => {
              if (!pending && !locked) onChange(pressed ? selected.filter((v) => v !== p.value) : [...selected, p.value])
            }}
          >
            {p.value}
          </Button>
        )
      })}
    </fieldset>
  )
}
