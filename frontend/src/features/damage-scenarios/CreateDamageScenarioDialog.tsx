import { useTranslation } from 'react-i18next'
import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { matchPath, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { CiaProperty, ItemAsset } from '../../api/models/asset'
import type { DamageScenario } from '../../api/models/damageScenario'
import type { EntityType, TreeNode } from '../../api/models/tree'
import { useCreateDamageScenario, useItemAssets, useProjectTree } from '../../api/queries/items'
import { AddAssetMenu } from '../assets/AddAssetMenu'
import { AssetPropertyToggles } from '../assets/AssetPropertyToggles'
import { CreateElementDialog } from '../workspace/CreateElementDialog'
import { entityPath, findNode } from '../workspace/entities'

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
  initialName?: string
  /** Fixes the owning item, e.g. when the new damage scenario is linked to an element of that item. */
  lockedItemId?: string
  /** Runs after creating, before the dialog goes on; rejecting keeps the dialog open, and trying again only repeats this step. */
  onCreated?: (scenario: DamageScenario) => Promise<unknown>
  /** Shown when `onCreated` rejects. */
  onCreatedError?: (scenario: DamageScenario) => string
}

/**
 * "+ New → Damage Scenario" wireframe: name, owning item and the asset properties whose compromise leads to it.
 * Defaults to the item and asset of the current page; the tree has no place for unlinked damage scenarios yet.
 */
export function CreateDamageScenarioDialog({ projectId, projectName, open, onOpenChange, returnFocusTo, initialName, lockedItemId, onCreated, onCreatedError }: CreateDamageScenarioDialogProps) {
  const { t } = useTranslation()
  const id = useId()
  const items = (useProjectTree(projectId).data ?? []).filter((node) => node.type === 'items')
  const defaults = useContextDefaults(items)
  // Only the user's choices are stored, so defaults that arrive later (the tree loads after opening) still apply.
  const [chosenItemId, setChosenItemId] = useState<string>()
  const [chosenLinks, setChosenLinks] = useState<AssetLink[]>()
  const itemId = lockedItemId ?? chosenItemId ?? defaults.itemId
  const links = chosenLinks ?? defaults.links
  const [linkError, setLinkError] = useState<{ key: string; code?: string }>()
  const { data: assets } = useItemAssets(projectId, itemId)
  const createDamageScenario = useCreateDamageScenario(projectId)
  // Created, but `onCreated` failed; trying again must not create a second one with the same name.
  const [unfinished, setUnfinished] = useState<DamageScenario>()

  const linked = links.flatMap((link) => {
    const asset = assets?.find((a) => a.id === link.assetId)
    return asset ? [{ asset, properties: link.properties ?? asset.properties }] : []
  })

  /** Undefined goes back to the default links. */
  function changeLinks(next: AssetLink[] | undefined) {
    setChosenLinks(next)
    setLinkError(undefined)
  }

  async function finish(scenario: DamageScenario) {
    try {
      await onCreated?.(scenario)
    } catch (error) {
      setUnfinished(scenario)
      throw error
    }
    setUnfinished(undefined)
    return { name: scenario.title, path: entityPath(projectId, 'damage-scenarios', scenario.id) }
  }

  async function create(name: string) {
    if (unfinished) return finish(unfinished)
    // The links only count once the assets are there, so "Link at least one asset" would be wrong.
    if (!assets) {
      setLinkError({ key: 'ui:assetsLoading' })
      return undefined
    }
    if (linked.length === 0) {
      setLinkError({ key: 'ui:assetRequired' })
      return undefined
    }
    const empty = linked.find((link) => link.properties.length === 0)
    if (empty) {
      setLinkError({ key: 'ui:propertyRequired', code: empty.asset.code })
      return undefined
    }
    const scenario = await createDamageScenario.mutateAsync({
      item_definition_id: itemId,
      title: name,
      asset_properties: linked.flatMap(({ asset, properties }) => properties.map((property) => ({ asset_id: asset.id, property }))),
    })
    return finish(scenario)
  }

  return (
    <CreateElementDialog
      title={t('ui:newDamageScenario')}
      description={t('ui:damageContext', { name: projectName })}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      initialName={initialName}
      namePlaceholder={t('ui:damageNamePlaceholder')}
      hint={t('ui:damageTreeHint')}
      errorMessage={unfinished ? (onCreatedError?.(unfinished) ?? t('ui:createdNextStepError', { code: unfinished.code })) : t('ui:createDamageError')}
      locked={Boolean(unfinished)}
      onCreate={create}
      onReset={() => {
        setUnfinished(undefined)
        setChosenItemId(undefined)
        changeLinks(undefined)
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={`${id}-item`}>{t('entities.items')}</Label>
        <NativeSelect
          id={`${id}-item`}
          value={itemId}
          disabled={Boolean(lockedItemId)}
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
        <legend className="mb-2 text-sm font-medium">{t('ui:linkTo')}</legend>
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
            {t(linkError.key, { code: linkError.code })}
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
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-3 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-sm">
      <span>
        <span className="font-mono text-xs text-muted-foreground">{asset.code}</span> {asset.name}
      </span>
      <AssetPropertyToggles asset={asset} selected={properties} onChange={onChange} />
      <Button type="button" variant="ghost" size="icon-xs" className="rounded-full" aria-label={t('ui:removeNamed', { name: `${asset.code} ${asset.name}` })} onClick={onRemove}>
        <X aria-hidden="true" />
      </Button>
    </li>
  )
}
