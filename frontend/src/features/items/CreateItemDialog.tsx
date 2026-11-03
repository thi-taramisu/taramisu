import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { CreateElementDialog } from '../workspace/CreateElementDialog'
import { entityPath } from '../workspace/entities'
import { ITEM_NAME_MAX_LENGTH, type ScopeType } from '../../api/models/item'
import { useCreateItem } from '../../api/queries/items'

const SCOPE_TYPES: { value: ScopeType; label: string }[] = [
  { value: 'ITEM', label: 'Item (item definition, WP-09-01)' },
  { value: 'COMPONENT', label: 'Component (cybersecurity specification, WP-10-01)' },
]

const LIFECYCLE_PHASES = ['Concept', 'Product development', 'Post-development']

interface CreateItemDialogProps {
  projectId: string
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo?: HTMLButtonElement | null
}

/** "+ New → Item" from the interactive wireframe. */
export function CreateItemDialog({ projectId, projectName, open, onOpenChange, returnFocusTo }: CreateItemDialogProps) {
  const id = useId()
  const createItem = useCreateItem(projectId)

  async function create(name: string, form: HTMLFormElement) {
    const data = new FormData(form)
    const item = await createItem.mutateAsync({
      name,
      scope_type: data.get('scope_type') as ScopeType,
      lifecycle_phase: String(data.get('lifecycle_phase')),
    })
    return { name: item.name, path: entityPath(projectId, 'items', item.id) }
  }

  return (
    <CreateElementDialog
      title="New Item"
      description={`in project ${projectName} · details follow in the item definition`}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      namePlaceholder="e.g. Charging Control Unit"
      nameMaxLength={ITEM_NAME_MAX_LENGTH}
      hint="Will appear in the tree as a new item."
      errorMessage="The item could not be created. Please try again."
      onCreate={create}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-scope`}>Scope type</Label>
          <NativeSelect id={`${id}-scope`} name="scope_type" defaultValue="ITEM" className="w-full">
            {SCOPE_TYPES.map((scope) => (
              <NativeSelectOption key={scope.value} value={scope.value}>
                {scope.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-phase`}>Lifecycle phase</Label>
          <NativeSelect id={`${id}-phase`} name="lifecycle_phase" defaultValue="Concept" className="w-full">
            {LIFECYCLE_PHASES.map((phase) => (
              <NativeSelectOption key={phase} value={phase}>
                {phase}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
    </CreateElementDialog>
  )
}
