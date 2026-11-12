import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { CiaProperty } from '../../api/models/asset'
import { useCreateAsset, useItemAssets, useProjectTree } from '../../api/queries/items'
import { CreateElementDialog } from '../workspace/CreateElementDialog'
import { entityPath } from '../workspace/entities'
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
  const id = useId()
  const items = (useProjectTree(projectId).data ?? []).filter((node) => node.type === 'items')
  const context = usePageContext(items)
  // Only the user's choice is stored, so a default that arrives later (the tree loads after opening) still applies.
  const [chosenItemId, setChosenItemId] = useState<string>()
  const itemId = lockedItemId ?? chosenItemId ?? context.itemId
  const [component, setComponent] = useState('')
  const [properties, setProperties] = useState<CiaProperty[]>([])
  const [name, setName] = useState('')
  const { data: assets } = useItemAssets(projectId, itemId)
  const createAsset = useCreateAsset(projectId)
  const similar = assets && findSimilarAsset(name, assets)

  async function create(trimmedName: string) {
    const asset = await createAsset.mutateAsync({
      itemId,
      // Kept in C / I / A order, whatever order they were ticked in.
      asset: { name: trimmedName, component: component.trim(), properties: CIA_PROPERTIES.map((p) => p.value).filter((p) => properties.includes(p)) },
    })
    return { name: `${asset.code} ${asset.name}`, path: entityPath(projectId, 'assets', asset.id) }
  }

  return (
    <CreateElementDialog
      title="New Asset"
      description={`in project ${projectName} · only the name is required, details follow on the asset page`}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      namePlaceholder="e.g. Contactor control signal"
      hint="Will appear in the tree below the item."
      errorMessage="The asset could not be created. Please try again."
      onCreate={create}
      onNameChange={setName}
      onReset={() => {
        setChosenItemId(undefined)
        setComponent('')
        setProperties([])
      }}
    >
      {similar && (
        <p className="-mt-2 text-sm text-muted-foreground">
          Similar existing:{' '}
          <Link to={entityPath(projectId, 'assets', similar.id)} onClick={() => onOpenChange(false)} className="underline">
            {similar.code} {similar.name}
          </Link>
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor={`${id}-item`}>Item</Label>
        <NativeSelect
          id={`${id}-item`}
          value={itemId}
          disabled={Boolean(lockedItemId)}
          onChange={(event) => setChosenItemId(event.target.value)}
          className="w-full"
        >
          {items.map((item) => (
            <NativeSelectOption key={item.id} value={item.id}>
              {item.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-component`}>Component / Interface</Label>
        <Input
          id={`${id}-component`}
          value={component}
          placeholder="Where the asset lives, e.g. Body control ECU"
          onChange={(event) => setComponent(event.target.value)}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Cybersecurity Properties</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {CIA_PROPERTIES.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${value}`}
                checked={properties.includes(value)}
                onCheckedChange={(checked) => setProperties((prev) => (checked === true ? [...prev, value] : prev.filter((p) => p !== value)))}
              />
              <Label htmlFor={`${id}-${value}`} className="font-normal">
                {label}
              </Label>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">A damage scenario can only be linked through a declared property.</p>
      </fieldset>
    </CreateElementDialog>
  )
}
