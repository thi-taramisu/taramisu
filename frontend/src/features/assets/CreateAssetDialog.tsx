import { useTranslation } from 'react-i18next'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { CiaProperty } from '../../api/models/asset'
import { useCreateAsset, useItemAssets, useProjectTree } from '../../api/queries/items'
import { CreateElementDialog } from '../workspace/CreateElementDialog'
import { entityPath, formatEntityId } from '../workspace/entities'
import { ItemSelectField } from '../workspace/ItemSelectField'
import { usePageContext } from '../workspace/usePageContext'
import { CIA_PROPERTIES } from './ciaProperties'
import { findSimilarAsset } from './similarAsset'

interface CreateAssetDialogProps {
  projectId: string
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo?: HTMLButtonElement | null
  /** Fixes the owning item, e.g. on the item's Assets tab. */
  lockedItemId?: string
}

/**
 * "+ New → Asset" wireframe: only the name is required, the rest follows on the asset page. Starts with the
 * item of the current page and points out a similar existing asset to avoid duplicates.
 */
export function CreateAssetDialog({ projectId, projectName, open, onOpenChange, returnFocusTo, lockedItemId }: CreateAssetDialogProps) {
  const { t } = useTranslation()
  const id = useId()
  const items = (useProjectTree(projectId).data ?? []).filter((node) => node.type === 'items')
  const context = usePageContext(items)
  // Only the user's choice is stored, so a default that arrives later (the tree loads after opening) still applies.
  const [chosenItemId, setChosenItemId] = useState<string>()
  const itemId = lockedItemId ?? chosenItemId ?? context.itemId
  const [properties, setProperties] = useState<CiaProperty[]>([])
  const [name, setName] = useState('')
  const { data: assets } = useItemAssets(projectId, itemId)
  const createAsset = useCreateAsset(projectId)
  const similar = assets && findSimilarAsset(name, assets)

  async function create(trimmedName: string) {
    const asset = await createAsset.mutateAsync({
      itemId,
      // Kept in C / I / A order, whatever order they were ticked in.
      asset: { name: trimmedName, properties: CIA_PROPERTIES.map((p) => p.value).filter((p) => properties.includes(p)) },
    })
    return { name: `${formatEntityId(asset.code)} ${asset.name}`, path: entityPath(projectId, 'assets', asset.id) }
  }

  return (
    <CreateElementDialog
      title={t('ui:assetPage.newAsset')}
      description={t('ui:assetPage.context', { name: projectName })}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      namePlaceholder={t('ui:assetPage.createNamePlaceholder')}
      hint={t('ui:assetPage.treeHint')}
      errorMessage={t('ui:assetPage.createError')}
      onCreate={create}
      onNameChange={setName}
      onReset={() => {
        setChosenItemId(undefined)
        setProperties([])
      }}
    >
      {similar && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {t('ui:assetPage.similarExisting')}{' '}
          <Link to={entityPath(projectId, 'assets', similar.id)} onClick={() => onOpenChange(false)} className="underline">
            {formatEntityId(similar.code)} {similar.name}
          </Link>
        </p>
      )}
      <ItemSelectField items={items} value={itemId} locked={Boolean(lockedItemId)} onChange={setChosenItemId} />
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t('ui:cybersecurityProperties')}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {CIA_PROPERTIES.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${value}`}
                checked={properties.includes(value)}
                onCheckedChange={(checked) => setProperties((prev) => (checked === true ? [...prev, value] : prev.filter((p) => p !== value)))}
              />
              <Label htmlFor={`${id}-${value}`} className="font-normal">
                {t(label)}
              </Label>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('ui:assetPage.propertiesLinkHint')}</p>
      </fieldset>
    </CreateElementDialog>
  )
}
