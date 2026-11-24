import { useTranslation } from 'react-i18next'
import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { CreateElementDialog } from '../workspace/CreateElementDialog'
import { entityPath } from '../workspace/entities'
import { ITEM_NAME_MAX_LENGTH, type ScopeType } from '../../api/models/item'
import { useCreateItem } from '../../api/queries/items'

const SCOPE_TYPES: { value: ScopeType; label: string }[] = [
  { value: 'ITEM', label: 'ui:itemScope' },
  { value: 'COMPONENT', label: 'ui:componentScope' },
]

const LIFECYCLE_PHASES = [
  { value: 'Concept', label: 'ui:concept' },
  { value: 'Product development', label: 'ui:productDevelopment' },
  { value: 'Post-development', label: 'ui:postDevelopment' },
]

interface CreateItemDialogProps {
  projectId: string
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo?: HTMLButtonElement | null
}

/** "+ New → Item" from the interactive wireframe. */
export function CreateItemDialog({ projectId, projectName, open, onOpenChange, returnFocusTo }: CreateItemDialogProps) {
  const { t } = useTranslation()
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
      title={t('ui:newItem')}
      description={t('ui:itemContext', { name: projectName })}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      namePlaceholder={t('ui:itemNamePlaceholder')}
      nameMaxLength={ITEM_NAME_MAX_LENGTH}
      hint={t('ui:itemTreeHint')}
      errorMessage={t('ui:createItemError')}
      onCreate={create}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-scope`}>{t('ui:scopeType')}</Label>
          <NativeSelect id={`${id}-scope`} name="scope_type" defaultValue="ITEM" className="w-full">
            {SCOPE_TYPES.map((scope) => (
              <NativeSelectOption key={scope.value} value={scope.value}>
                {t(scope.label)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-phase`}>{t('ui:lifecyclePhase')}</Label>
          <NativeSelect id={`${id}-phase`} name="lifecycle_phase" defaultValue="Concept" className="w-full">
            {LIFECYCLE_PHASES.map((phase) => (
              <NativeSelectOption key={phase.value} value={phase.value}>
                {t(phase.label)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
    </CreateElementDialog>
  )
}
