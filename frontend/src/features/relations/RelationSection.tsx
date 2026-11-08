import { useId, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Link } from 'react-router-dom'
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
import type { EntityType } from '../../api/models/tree'
import { ENTITY_TYPES, entityPath, entityTitle } from '../workspace/entities'
import { AddRelationDialog, type RelationEntry } from './AddRelationDialog'

interface RelationSectionProps {
  projectId: string
  /** Type of the linked elements. */
  type: EntityType
  /** Where the linked elements are in the TARA hierarchy, seen from the current element. */
  direction: 'up' | 'down'
  title: string
  /** Singular name of the linked elements, e.g. "Asset". */
  elementLabel: string
  rows: RelationEntry[]
  /** Existing elements that can still be linked. */
  candidates: RelationEntry[]
  candidatesLoading?: boolean
  candidatesError?: string
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  /** Blocks further changes while a request runs. */
  pending?: boolean
  error?: string
}

/**
 * One block of a Relations tab (DS / TS Relation wireframes): the linked elements of one type with
 * "+ Add …" and remove. Knows nothing about the element it belongs to, so every Relations tab can use it.
 */
export function RelationSection({ projectId, type, direction, title, elementLabel, rows, candidates, candidatesLoading, candidatesError, onAdd, onRemove, pending = false, error }: RelationSectionProps) {
  const headingId = useId()
  const Arrow = direction === 'up' ? ArrowUp : ArrowDown
  const directionHint = direction === 'up' ? 'Above in the hierarchy' : 'Below in the hierarchy'
  // Gets the focus after a removal, because the row with the remove button is gone then.
  const [addButton, setAddButton] = useState<HTMLButtonElement | null>(null)

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
        <span title={directionHint}>
          <Arrow aria-hidden="true" className="size-4" />
          <span className="sr-only">{directionHint}</span>
        </span>
        <h2 id={headingId} className="flex-1 text-sm font-medium">
          {title}
        </h2>
        <AddRelationDialog elementLabel={elementLabel} pluralLabel={title.toLowerCase()} options={candidates} loading={candidatesLoading} loadError={candidatesError} pending={pending} triggerRef={setAddButton} onAdd={onAdd} />
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No {title.toLowerCase()} linked yet.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{row.code}</span>
              <div className="min-w-0 flex-1 truncate text-sm">
                <Link to={entityPath(projectId, type, row.id)} title={row.name} className="hover:underline">
                  {row.name}
                </Link>
              </div>
              {row.details}
              <RemoveRelationButton
                row={row}
                typeLabel={ENTITY_TYPES[type].label}
                pending={pending}
                returnFocusTo={addButton}
                onRemove={() => onRemove(row.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="border-t px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

interface RemoveRelationButtonProps {
  row: RelationEntry
  typeLabel: string
  pending: boolean
  returnFocusTo: HTMLButtonElement | null
  onRemove: () => void
}

function RemoveRelationButton({ row, typeLabel, pending, returnFocusTo, onRemove }: RemoveRelationButtonProps) {
  const name = entityTitle(row)
  const [open, setOpen] = useState(false)
  const removing = useRef(false)

  return (
    <AlertDialog open={open} onOpenChange={(next) => setOpen(next && !pending)}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={pending ? 'opacity-50' : undefined}
          aria-disabled={pending}
          aria-label={`Remove link to ${name}`}
          title="Remove link"
        >
          <X aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (removing.current && returnFocusTo?.isConnected) {
            event.preventDefault()
            returnFocusTo.focus()
          }
          removing.current = false
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Remove link to "{name}"?</AlertDialogTitle>
          <AlertDialogDescription>The {typeLabel.toLowerCase()} stays in the project. Only this link is removed.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              removing.current = true
              onRemove()
            }}
          >
            Remove link
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
