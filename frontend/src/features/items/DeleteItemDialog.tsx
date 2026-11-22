import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { ItemDefinition } from '../../api/models/item'
import type { EntityType, TreeNode } from '../../api/models/tree'
import { useDeleteItem, useItemChildren, useItemUnassigned } from '../../api/queries/items'
import { ENTITY_TYPES } from '../workspace/entities'

/** Each element once by type and id, also when the tree shows it below several parents. */
function collectElements(nodes: readonly TreeNode[], found = new Map<string, TreeNode>()) {
  for (const node of nodes) {
    found.set(`${node.type}/${node.id}`, node)
    collectElements(node.children ?? [], found)
  }
  return found
}

/** Count of one type with its plural, e.g. "4 assets"; literal keys so the localization check sees them. */
function countOf(t: TFunction, type: EntityType, count: number) {
  switch (type) {
    case 'items': return t('ui:itemCount', { count })
    case 'assets': return t('ui:assetCount', { count })
    case 'damage-scenarios': return t('ui:damageScenarioCount', { count })
    case 'threat-scenarios': return t('ui:threatScenarioCount', { count })
    case 'attack-paths': return t('ui:attackPathCount', { count })
  }
}

/** What is deleted along with the item by type, e.g. "4 assets and 1 damage scenario"; types it does not have are left out. */
function deletedWithItem(t: TFunction, language: string, elements: readonly TreeNode[]) {
  const counts = (Object.keys(ENTITY_TYPES) as EntityType[]).flatMap((type) => {
    const count = elements.filter((node) => node.type === type).length
    return count > 0 ? [countOf(t, type, count)] : []
  })
  return counts.length > 0 ? t('ui:deleteItemChildren', { elements: new Intl.ListFormat(language).format(counts) }) : ''
}

/** Confirmation before deleting an item; not in the wireframes, built from the shadcn AlertDialog. */
export function DeleteItemDialog({ item }: { item: ItemDefinition }) {
  const { t, i18n } = useTranslation()
  const projectId = item.tara_project_id
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  // The warning must name what is deleted, so the action waits for the counts. They are loaded
  // separately because the tree shows a failed request as an item with nothing below it.
  const children = useItemChildren(projectId, item.id, { enabled: open })
  // Unassigned elements belong to the item as well and are deleted with it.
  const unassigned = useItemUnassigned(projectId, item.id, { enabled: open })
  const deleteItem = useDeleteItem(projectId, item.id)

  const elements = [...collectElements([...(children.data ?? []), ...(unassigned.data ?? [])]).values()]
  const loaded = children.isSuccess && unassigned.isSuccess

  function handleDelete() {
    deleteItem.mutate(undefined, { onSuccess: () => navigate(`/projects/${projectId}`) })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (deleteItem.isPending) return
        deleteItem.reset()
        setOpen(next)
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 aria-hidden="true" />
          {t('ui:deleteItem')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('ui:deleteItemTitle', { name: item.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {deletedWithItem(t, i18n.resolvedLanguage ?? 'en', elements)}
            {t('ui:cannotUndo')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {(children.isError || unassigned.isError) && (
          <div className="flex items-center justify-between gap-2">
            <p role="alert" className="text-sm text-destructive">
              {t('ui:loadChildrenError')}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (children.isError) void children.refetch()
                if (unassigned.isError) void unassigned.refetch()
              }}
            >
              {t('ui:retry')}
            </Button>
          </div>
        )}
        {deleteItem.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t('ui:deleteItemError')}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t('ui:cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!loaded || deleteItem.isPending}
            onClick={(event) => {
              // Keep the dialog open until the request finished.
              event.preventDefault()
              handleDelete()
            }}
          >
            {t('ui:deleteItem')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
