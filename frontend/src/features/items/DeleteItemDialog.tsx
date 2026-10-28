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
import { useDeleteItem, useProjectTree } from '../../api/queries/items'

function countBelow(nodes: readonly TreeNode[] = []): number {
  return nodes.reduce((sum, node) => sum + 1 + countBelow(node.children), 0)
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Confirmation before deleting an item; not in the wireframes, built from the shadcn AlertDialog. */
export function DeleteItemDialog({ item }: { item: ItemDefinition }) {
  const projectId = item.tara_project_id
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { data: tree } = useProjectTree(projectId)
  // The warning must name what is deleted, so the action waits for the counts.
  const countsLoaded = Boolean(tree)
  const deleteItem = useDeleteItem(projectId, item.id)

  const below = tree?.find((node) => node.id === item.id)?.children ?? []
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
          Delete item
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {assets + others > 0
              ? `This also deletes its ${plural(assets, 'asset')} and ${plural(others, 'element')} below them (damage scenarios, threat scenarios, attack paths). `
              : ''}
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteItem.isError && (
          <p role="alert" className="text-sm text-destructive">
            The item could not be deleted. Please try again.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!countsLoaded || deleteItem.isPending}
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
