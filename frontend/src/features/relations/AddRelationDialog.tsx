import { useTranslation } from 'react-i18next'
import { useId, useState, type ReactNode, type Ref } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { EntityRef } from '../../api/models/tree'

/** A linked element or one that can be linked. */
export interface RelationEntry extends EntityRef {
  /** Shown after the name, e.g. the C / I / A properties of an asset. */
  details?: ReactNode
}

interface AddRelationDialogProps {
  /** Singular name of the linked elements, e.g. "Threat Scenario". */
  elementLabel: string
  /** Plural name of the linked elements in lower case, for the empty states. */
  pluralLabel: string
  /** Elements that can still be linked. */
  options: RelationEntry[]
  /** The options are still on their way, so an empty list says nothing yet. */
  loading?: boolean
  /** The options could not be loaded. */
  loadError?: string
  onAdd: (id: string) => void
  /** Keeps the dialog closed while a request runs; the focus stays on the button. */
  pending?: boolean
  triggerRef?: Ref<HTMLButtonElement>
}

/** "+ Add …" dialog ("Add Damage Scenario" wireframe): search and link an existing element of the item. */
export function AddRelationDialog({ elementLabel, pluralLabel, options, loading = false, loadError, onAdd, pending = false, triggerRef }: AddRelationDialogProps) {
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const title = t('ui:addRelation', { element: elementLabel })
  const term = search.trim().toLowerCase()
  const matches = options.filter((option) => `${option.code} ${option.name}`.toLowerCase().includes(term))

  function handleOpenChange(next: boolean) {
    setOpen(next && !pending)
    setSearch('')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button ref={triggerRef} type="button" variant="outline" size="sm" className={pending ? 'opacity-50' : undefined} aria-disabled={pending}>
          <Plus aria-hidden="true" />
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{t('ui:linkExistingDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 p-4">
          <Input aria-label={t('ui:searchRelations')} placeholder={t('ui:searchRelations')} value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="grid gap-1">
            <h3 id={`${id}-existing`} className="font-medium">
              {t('ui:linkExistingInItem')}
            </h3>
            {loadError ? (
              <p role="alert" className="py-2 text-sm text-destructive">
                {loadError}
              </p>
            ) : loading ? (
              <output className="py-2 text-muted-foreground">{t('ui:loading')}</output>
            ) : matches.length === 0 ? (
              <p className="py-2 text-muted-foreground">
                {t(term ? 'ui:noRelationMatches' : 'ui:noRemainingRelations', { elements: pluralLabel, search: search.trim() })}
              </p>
            ) : (
              <ul aria-labelledby={`${id}-existing`} className="max-h-64 overflow-y-auto">
                {matches.map((option) => (
                  <li key={option.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start gap-3 py-2 font-normal whitespace-normal"
                      onClick={() => {
                        handleOpenChange(false)
                        onAdd(option.id)
                      }}
                    >
                      <span className="w-14 shrink-0 text-left font-mono text-xs text-muted-foreground">{option.code}</span>{' '}
                      <span className="text-left">{option.name}</span>{' '}
                      {option.details && <span className="ml-auto shrink-0">{option.details}</span>}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 justify-start p-2 sm:justify-start">
          {/* Follows with the create dialogs of the element types, like the disabled entries of the "+ New" menu. */}
          <Button type="button" variant="ghost" size="sm" disabled>
            <Plus aria-hidden="true" />
            {t('ui:createRelatedElement', { element: elementLabel })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
