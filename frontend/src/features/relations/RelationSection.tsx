import { useTranslation } from 'react-i18next'
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
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
import { entityPath, entityTitle } from '../workspace/entities'
import { AddRelationDialog, type RelationEntry } from './AddRelationDialog'

/** What the section passes to its dialog for creating an element. */
export interface RelationCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName: string
  returnFocusTo: HTMLButtonElement | null
}

interface RelationSectionProps {
  projectId: string
  /** Type of the linked elements. */
  type: EntityType
  /** Where the linked elements are in the TARA hierarchy, seen from the current element. */
  direction: 'up' | 'down'
  title: string
  /** Plural noun used in sentences, with language-appropriate capitalization. */
  pluralLabel: string
  /** Singular name of the linked elements, e.g. "Asset". */
  elementLabel: string
  rows: RelationEntry[]
  /** Existing elements that can still be linked. */
  candidates: RelationEntry[]
  candidatesLoading?: boolean
  candidatesError?: string
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  /** What removing a link does besides that, shown in the confirmation; defaults to only the link. */
  removeEffect?: string
  /** Dialog for creating a new element and linking it; without it creating is not available yet. */
  renderCreateDialog?: (props: RelationCreateDialogProps) => ReactNode
  /** Blocks further changes while a request runs. */
  pending?: boolean
  error?: string
}

/**
 * One block of a Relations tab (DS / TS Relation wireframes): the linked elements of one type with
 * "+ Add …" and remove. Knows nothing about the element it belongs to, so every Relations tab can use it.
 */
export function RelationSection({ projectId, type, direction, title, pluralLabel, elementLabel, rows, candidates, candidatesLoading, candidatesError, onAdd, onRemove, removeEffect, renderCreateDialog, pending = false, error }: RelationSectionProps) {
  const { t } = useTranslation()
  const headingId = useId()
  const Arrow = direction === 'up' ? ArrowUp : ArrowDown
  const directionHint = t(direction === 'up' ? 'ui:aboveHierarchy' : 'ui:belowHierarchy')
  // Gets the focus after a removal, because the row with the remove button is gone then.
  const [addButton, setAddButton] = useState<HTMLButtonElement | null>(null)
  const removingId = useRef<string | null>(null)

  // Moves the focus only once the row is really gone; if the removal fails, it stays on the remove button.
  useEffect(() => {
    const id = removingId.current
    if (id === null || pending) return
    removingId.current = null
    const focusLost = document.activeElement === null || document.activeElement === document.body
    if (focusLost && !rows.some((row) => row.id === id)) addButton?.focus()
  }, [rows, pending, addButton])
  // A new key per opening, so the dialog starts from the typed name.
  const [creating, setCreating] = useState({ open: false, name: '', key: 0 })

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
        <AddRelationDialog elementLabel={elementLabel} pluralLabel={pluralLabel} options={candidates} loading={candidatesLoading} loadError={candidatesError} pending={pending} triggerRef={setAddButton} onAdd={onAdd} onCreate={renderCreateDialog && ((name) => setCreating(({ key }) => ({ open: true, name, key: key + 1 })))} />
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t('ui:noLinkedElements', { elements: pluralLabel })}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{row.code}</span>
                <div className="min-w-0 flex-1 truncate text-sm">
                  <Link to={entityPath(projectId, type, row.id)} title={row.name} className="hover:underline">
                    {row.name}
                  </Link>
                </div>
                {row.details}
                <RemoveRelationButton
                  row={row}
                  effect={removeEffect ?? t('ui:onlyLinkRemoved')}
                  pending={pending}
                  onRemove={() => {
                    removingId.current = row.id
                    onRemove(row.id)
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="border-t px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {renderCreateDialog && creating.key > 0 && (
        <Fragment key={creating.key}>
          {renderCreateDialog({
            open: creating.open,
            onOpenChange: (open) => setCreating((prev) => ({ ...prev, open })),
            initialName: creating.name,
            returnFocusTo: addButton,
          })}
        </Fragment>
      )}
    </section>
  )
}

interface RemoveRelationButtonProps {
  row: RelationEntry
  effect: string
  pending: boolean
  onRemove: () => void
}

function RemoveRelationButton({ row, effect, pending, onRemove }: RemoveRelationButtonProps) {
  const { t } = useTranslation()
  const name = entityTitle(row)
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={(next) => setOpen(next && !pending)}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={pending ? 'opacity-50' : undefined}
          aria-disabled={pending}
          aria-label={t('ui:removeLinkTo', { name })}
          title={t('ui:removeLink')}
        >
          <X aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      {/* Returns the focus to the remove button; RelationSection moves it on once the row is gone. */}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('ui:removeLinkTitle', { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t('ui:linkedElementStays')} {effect}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('ui:cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onRemove}>
            {t('ui:removeLink')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
