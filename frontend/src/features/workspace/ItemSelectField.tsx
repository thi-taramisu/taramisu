import { useTranslation } from 'react-i18next'
import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { TreeNode } from '../../api/models/tree'

interface ItemSelectFieldProps {
  items: TreeNode[]
  value: string
  /** The owning item is fixed, e.g. when the new element is linked to an element of that item. */
  locked?: boolean
  onChange: (itemId: string) => void
}

/** "Item" field of the create dialogs: the item the new element belongs to. */
export function ItemSelectField({ items, value, locked = false, onChange }: ItemSelectFieldProps) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t('entities.items')}</Label>
      <NativeSelect id={id} value={value} disabled={locked} onChange={(event) => onChange(event.target.value)} className="w-full">
        {items.map((item) => (
          <NativeSelectOption key={item.id} value={item.id}>
            {item.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}
