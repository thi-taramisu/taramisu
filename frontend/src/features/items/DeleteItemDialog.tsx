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
import { useDeleteItem, useItemChildren, useItemUnassigned } from '../../api/queries/items'

/** Each element once by type and id, also when the tree shows it below several parents. */
function collectElements(nodes: readonly TreeNode[], found = new Map<string, TreeNode>()) {
  for (const node of nodes) {
    found.set(`${node.type}/${node.id}`, node)
    collectElements(node.children ?? [], found)
  }
  return found
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** What is deleted along with the item; an item can have unassigned elements without any asset. */
function deletedWithItem(assets: number, others: number) {
  const elements = '(damage scenarios, threat scenarios, attack paths)'
  if (assets === 0) return `This also deletes its ${plural(others, 'element')} ${elements}. `
  if (others === 0) return `This also deletes its ${plural(assets, 'asset')}. `
  return `This also deletes its ${plural(assets, 'asset')} and ${plural(others, 'other element')} ${elements}. `
}

/** Confirmation before deleting an item; not in the wireframes, built from the shadcn AlertDialog. */
export function DeleteItemDialog({ item }: { item: ItemDefinition }) {
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
  const assets = elements.filter((node) => node.type === 'assets').length
  const others = elements.length - assets
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
          Delete item
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {elements.length > 0 ? deletedWithItem(assets, others) : ''}
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {(children.isError || unassigned.isError) && (
          <div className="flex items-center justify-between gap-2">
            <p role="alert" className="text-sm text-destructive">
              The elements below this item could not be loaded.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (children.isError) void children.refetch()
                if (unassigned.isError) void unassigned.refetch()
              }}
            >
              Retry
            </Button>
          </div>
        )}
        {deleteItem.isError && (
          <p role="alert" className="text-sm text-destructive">
            The item could not be deleted. Please try again.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!loaded || deleteItem.isPending}
            onClick={(event) => {
              // Keep the dialog open until the request finished.
              event.preventDefault()
              handleDelete()
            }}
          >
            Delete item
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
