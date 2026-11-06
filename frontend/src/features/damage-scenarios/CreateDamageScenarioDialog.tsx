import { useId, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { matchPath, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { CiaProperty, ItemAsset } from '../../api/models/asset'
import type { EntityType, TreeNode } from '../../api/models/tree'
import { useCreateDamageScenario, useItemAssets, useProjectTree } from '../../api/queries/items'
import { CreateElementDialog } from '../workspace/CreateElementDialog'
import { entityPath, findNode } from '../workspace/entities'

const PROPERTIES: { value: CiaProperty; label: string }[] = [
  { value: 'C', label: 'Confidentiality' },
  { value: 'I', label: 'Integrity' },
  { value: 'A', label: 'Availability' },
]

interface AssetLink {
  assetId: string
  /** Linked properties of the asset; all of them until the user changes the selection. */
  properties?: CiaProperty[]
}

/** Item and asset of the page the dialog is opened on, used as the defaults. */
function useContextDefaults(items: TreeNode[]): { itemId: string; links: AssetLink[] } {
  const { pathname } = useLocation()
  const match = matchPath('/projects/:projectId/:type/:entityId/*', pathname)
  const type = match?.params.type as EntityType | undefined
  const entityId = match?.params.entityId ?? ''
  const item = (type && items.find((node) => findNode(type, entityId, [node]))) || items[0]
  return { itemId: item?.id ?? '', links: type === 'assets' && item ? [{ assetId: entityId }] : [] }
}

interface CreateDamageScenarioDialogProps {
  projectId: string
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo?: HTMLButtonElement | null
}

/**
 * "+ New → Damage Scenario" wireframe: name, owning item and the asset properties whose compromise leads to it.
 * Defaults to the item and asset of the current page; the tree has no place for unlinked damage scenarios yet.
 */
export function CreateDamageScenarioDialog({ projectId, projectName, open, onOpenChange, returnFocusTo }: CreateDamageScenarioDialogProps) {
  const id = useId()
  const items = (useProjectTree(projectId).data ?? []).filter((node) => node.type === 'items')
  const defaults = useContextDefaults(items)
  // Only the user's choices are stored, so defaults that arrive later (the tree loads after opening) still apply.
  const [chosenItemId, setChosenItemId] = useState<string>()
  const [chosenLinks, setChosenLinks] = useState<AssetLink[]>()
  const itemId = chosenItemId ?? defaults.itemId
  const links = chosenLinks ?? defaults.links
  const [linkError, setLinkError] = useState<string>()
  const { data: assets } = useItemAssets(projectId, itemId)
  const createDamageScenario = useCreateDamageScenario(projectId)

  const linked = links.flatMap((link) => {
    const asset = assets?.find((a) => a.id === link.assetId)
    return asset ? [{ asset, properties: link.properties ?? asset.properties }] : []
  })

  /** Undefined goes back to the default links. */
  function changeLinks(next: AssetLink[] | undefined) {
    setChosenLinks(next)
    setLinkError(undefined)
  }

  async function create(name: string) {
    // The links only count once the assets are there, so "Link at least one asset" would be wrong.
    if (!assets) {
      setLinkError('The assets are still loading.')
      return undefined
    }
    if (linked.length === 0) {
      setLinkError('Link at least one asset.')
      return undefined
    }
    const empty = linked.find((link) => link.properties.length === 0)
    if (empty) {
      setLinkError(`Select at least one property of ${empty.asset.code}.`)
      return undefined
    }
    const scenario = await createDamageScenario.mutateAsync({
      item_definition_id: itemId,
      title: name,
      asset_properties: linked.flatMap(({ asset, properties }) => properties.map((property) => ({ asset_id: asset.id, property }))),
    })
    return { name: scenario.title, path: entityPath(projectId, 'damage-scenarios', scenario.id) }
  }

  return (
    <CreateElementDialog
      title="New Damage Scenario"
      description={`in project ${projectName} · description and impact follow on the damage scenario page`}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      namePlaceholder="e.g. Loss of cell balancing"
      hint="Will appear in the tree below each linked asset."
      errorMessage="The damage scenario could not be created. Please try again."
      onCreate={create}
      onReset={() => {
        setChosenItemId(undefined)
        changeLinks(undefined)
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={`${id}-item`}>Item</Label>
        <NativeSelect
          id={`${id}-item`}
          value={itemId}
          onChange={(event) => {
            setChosenItemId(event.target.value)
            // Assets belong to one item, so its links do not carry over.
            changeLinks([])
          }}
          className="w-full"
        >
          {items.map((item) => (
            <NativeSelectOption key={item.id} value={item.id}>
              {item.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <fieldset className="grid gap-2 border-t pt-4" aria-describedby={linkError ? `${id}-link-error` : undefined}>
        <legend className="mb-2 text-sm font-medium">Link to</legend>
        {linked.length > 0 && (
          <ul className="grid justify-items-start gap-2">
            {linked.map(({ asset, properties }) => (
              <AssetLinkChip
                key={asset.id}
                asset={asset}
                properties={properties}
                onChange={(next) => changeLinks(links.map((link) => (link.assetId === asset.id ? { ...link, properties: next } : link)))}
                onRemove={() => changeLinks(links.filter((link) => link.assetId !== asset.id))}
              />
            ))}
          </ul>
        )}
        <AddAssetMenu
          assets={assets?.filter((asset) => !links.some((link) => link.assetId === asset.id)) ?? []}
          onAdd={(asset) => changeLinks([...links, { assetId: asset.id }])}
        />
        {linkError && (
          <p id={`${id}-link-error`} role="alert" className="text-sm text-destructive">
            {linkError}
          </p>
        )}
      </fieldset>
    </CreateElementDialog>
  )
}

interface AssetLinkChipProps {
  asset: ItemAsset
  properties: CiaProperty[]
  onChange: (properties: CiaProperty[]) => void
  onRemove: () => void
}

/** Linked asset as in the wireframe, with its C / I / A properties to link (DS Relation wireframe). */
function AssetLinkChip({ asset, properties, onChange, onRemove }: AssetLinkChipProps) {
  return (
    <li className="flex items-center gap-3 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-sm">
      <span>
        <span className="font-mono text-xs text-muted-foreground">{asset.code}</span> {asset.name}
      </span>
      <fieldset className="flex gap-1">
        <legend className="sr-only">{asset.code} properties</legend>
        {PROPERTIES.filter((p) => asset.properties.includes(p.value)).map((p) => {
          const pressed = properties.includes(p.value)
          return (
            <Button
              key={p.value}
              type="button"
              variant={pressed ? 'default' : 'outline'}
              size="icon-xs"
              className={`font-mono ${pressed ? '' : 'text-muted-foreground'}`}
              aria-pressed={pressed}
              aria-label={`${asset.code} ${p.label}`}
              title={p.label}
              onClick={() => onChange(pressed ? properties.filter((v) => v !== p.value) : [...properties, p.value])}
            >
              {p.value}
            </Button>
          )
        })}
      </fieldset>
      <Button type="button" variant="ghost" size="icon-xs" className="rounded-full" aria-label={`Remove ${asset.code} ${asset.name}`} onClick={onRemove}>
        <X aria-hidden="true" />
      </Button>
    </li>
  )
}

function AddAssetMenu({ assets, onAdd }: { assets: ItemAsset[]; onAdd: (asset: ItemAsset) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="justify-self-start border-dashed" disabled={assets.length === 0}>
          <Plus aria-hidden="true" />
          Add Asset
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {assets.map((asset) => (
          <DropdownMenuItem key={asset.id} onSelect={() => onAdd(asset)}>
            <span className="font-mono text-xs text-muted-foreground">{asset.code}</span> {asset.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
