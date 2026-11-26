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
import type { TreeNode } from '../../api/models/tree'
import { useDeleteItem, useItemChildren } from '../../api/queries/items'

function countBelow(nodes: readonly TreeNode[] = []): number {
  return nodes.reduce((sum, node) => sum + 1 + countBelow(node.children), 0)
}

/** Confirmation before deleting an item; not in the wireframes, built from the shadcn AlertDialog. */
export function DeleteItemDialog({ item }: { item: ItemDefinition }) {
  const { t } = useTranslation()
  const projectId = item.tara_project_id
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  // The warning must name what is deleted, so the action waits for the counts. They are loaded
  // separately because the tree shows a failed request as an item with nothing below it.
  const children = useItemChildren(projectId, item.id, { enabled: open })
  const deleteItem = useDeleteItem(projectId, item.id)

  const below = children.data ?? []
  const assets = below.filter((node) => node.type === 'assets').length
  const others = countBelow(below) - assets

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
            {assets + others > 0
              ? t('ui:deleteItemChildren', { assets: t('ui:assetCount', { count: assets }), elements: t('ui:elementCount', { count: others }) })
              : ''}
            {t('ui:cannotUndo')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children.isError && (
          <div className="flex items-center justify-between gap-2">
            <p role="alert" className="text-sm text-destructive">
              {t('ui:loadChildrenError')}
            </p>
            <Button variant="outline" size="sm" onClick={() => void children.refetch()}>
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
            disabled={!children.isSuccess || deleteItem.isPending}
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
