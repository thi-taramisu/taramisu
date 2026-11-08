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
}

/** C / I / A toggles of an asset link (DS Relation wireframe); only the properties the asset has can be linked. */
export function AssetPropertyToggles({ asset, selected, onChange, pending = false, requireOne = false }: AssetPropertyTogglesProps) {
  return (
    <fieldset className="flex gap-1">
      <legend className="sr-only">{asset.code} properties</legend>
      {CIA_PROPERTIES.filter((p) => asset.properties.includes(p.value)).map((p) => {
        const pressed = selected.includes(p.value)
        return (
          <Button
            key={p.value}
            type="button"
            variant={pressed ? 'default' : 'outline'}
            size="icon-xs"
            className={`font-mono ${pressed ? '' : 'border-dashed text-muted-foreground'}`}
            aria-pressed={pressed}
            aria-label={`${asset.code} ${p.label}`}
            title={p.label}
            aria-disabled={pending}
            disabled={requireOne && pressed && selected.length === 1}
            onClick={() => {
              if (!pending) onChange(pressed ? selected.filter((v) => v !== p.value) : [...selected, p.value])
            }}
          >
            {p.value}
          </Button>
        )
      })}
    </fieldset>
  )
}
