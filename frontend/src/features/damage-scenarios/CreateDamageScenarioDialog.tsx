import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import type { CiaProperty } from '../../api/models/asset'
import type { DamageScenario } from '../../api/models/damageScenario'
import type { TreeNode } from '../../api/models/tree'
import { useCreateDamageScenario, useItemAssets, useProjectTree } from '../../api/queries/items'
import { AssetPropertyToggles } from '../assets/AssetPropertyToggles'
import { CreateElementDialog } from '../workspace/CreateElementDialog'
import { entityPath, formatEntityId } from '../workspace/entities'
import { ItemSelectField } from '../workspace/ItemSelectField'
import { LinkToField } from '../workspace/LinkToField'
import { usePageContext } from '../workspace/usePageContext'

interface AssetLink {
  assetId: string
  /** Linked properties of the asset; all of them until the user changes the selection. */
  properties?: CiaProperty[]
}

/** Item and asset of the page the dialog is opened on, used as the defaults. */
function useContextDefaults(items: TreeNode[]): { itemId: string; links: AssetLink[] } {
  const { itemId, type, entityId } = usePageContext(items)
  return { itemId, links: type === 'assets' && itemId ? [{ assetId: entityId }] : [] }
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
 * Defaults to the item and asset of the current page; without assets it is created in "Unassigned" of the item.
 */
export function CreateDamageScenarioDialog({ projectId, projectName, open, onOpenChange, returnFocusTo, initialName, lockedItemId, onCreated, onCreatedError }: CreateDamageScenarioDialogProps) {
  const { t } = useTranslation()
  const tree = useProjectTree(projectId)
  const items = (tree.data ?? []).filter((node) => node.type === 'items')
  const defaults = useContextDefaults(items)
  // Only the user's choices are stored, so defaults that arrive later (the tree loads after opening) still apply.
  const [chosenItemId, setChosenItemId] = useState<string>()
  const [chosenLinks, setChosenLinks] = useState<AssetLink[]>()
  const itemId = lockedItemId ?? chosenItemId ?? defaults.itemId
  const links = chosenLinks ?? defaults.links
  const [linkError, setLinkError] = useState<{ key: string; code?: string }>()
  // Create was tried without an item; the message is derived, so it goes away once the items are there.
  const [itemMissing, setItemMissing] = useState(false)
  const itemError = itemMissing && !itemId
    ? (tree.isPending ? 'ui:itemsLoading' : tree.isError ? 'ui:loadItemsError' : 'ui:itemRequired')
    : undefined
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
    // Without links nothing waits for the assets anymore, but the owning item still has to be known.
    if (!itemId) {
      setItemMissing(true)
      return undefined
    }
    // The chosen links only count once the assets are there; creating before would leave it unassigned by accident.
    if (links.length > 0 && !assets) {
      setLinkError({ key: 'ui:assetsLoading' })
      return undefined
    }
    const empty = linked.find((link) => link.properties.length === 0)
    if (empty) {
      setLinkError({ key: 'ui:propertyRequired', code: formatEntityId(empty.asset.code) })
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
      // Matches the asset chips once the assets are there; until then the chosen links say where it will appear.
      // Without an item (none in the project, or they could not be loaded) it cannot appear anywhere yet.
      hint={
        !itemId && !tree.isPending
          ? t('ui:damageItemNeededHint')
          : (assets ? linked : links).length > 0
            ? t('ui:damageTreeHint')
            : t('ui:damageUnassignedHint')
      }
      errorMessage={
        unfinished
          ? (onCreatedError?.(unfinished) ?? t('ui:createdNextStepError', { code: formatEntityId(unfinished.code) }))
          : t('ui:createDamageError')
      }
      locked={Boolean(unfinished)}
      onCreate={create}
      onReset={() => {
        setUnfinished(undefined)
        setItemMissing(false)
        setChosenItemId(undefined)
        changeLinks(undefined)
      }}
    >
      <ItemSelectField
        items={items}
        value={itemId}
        locked={Boolean(lockedItemId)}
        error={itemError && t(itemError)}
        onChange={(next) => {
          setChosenItemId(next)
          // Assets belong to one item, so its links do not carry over.
          changeLinks([])
        }}
      />
      <LinkToField
        elementLabel={t('entities.assets')}
        linked={linked.map(({ asset, properties }) => ({
          element: asset,
          details: (
            <AssetPropertyToggles
              asset={asset}
              selected={properties}
              onChange={(next) => changeLinks(links.map((link) => (link.assetId === asset.id ? { ...link, properties: next } : link)))}
            />
          ),
        }))}
        candidates={assets?.filter((asset) => !links.some((link) => link.assetId === asset.id)) ?? []}
        onAdd={(asset) => changeLinks([...links, { assetId: asset.id }])}
        onRemove={(asset) => changeLinks(links.filter((link) => link.assetId !== asset.id))}
        error={linkError && t(linkError.key, { code: linkError.code })}
      />
    </CreateElementDialog>
  )
}
