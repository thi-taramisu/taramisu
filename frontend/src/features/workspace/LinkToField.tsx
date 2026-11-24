import { useTranslation } from 'react-i18next'
import { useId, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { EntityRef } from '../../api/models/tree'
import { formatEntityId } from './entities'

interface LinkToFieldProps<T extends EntityRef> {
  /** Translated singular name of the elements to link, e.g. "Asset". */
  elementLabel: string
  linked: { element: T; details?: ReactNode }[]
  /** Elements that can still be linked. */
  candidates: T[]
  onAdd: (element: T) => void
  onRemove: (element: T) => void
  error?: string
}

/** "Link to" part of the create dialogs (interactive wireframe): the linked elements as chips and "+ Add …". */
export function LinkToField<T extends EntityRef>({ elementLabel, linked, candidates, onAdd, onRemove, error }: LinkToFieldProps<T>) {
  const { t } = useTranslation()
  const errorId = useId()
  return (
    <fieldset className="grid gap-2 border-t pt-4" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 text-sm font-medium">{t('ui:linkTo')}</legend>
      {linked.length > 0 && (
        <ul className="grid justify-items-start gap-2">
          {linked.map(({ element, details }) => (
            <li key={element.id} className="flex items-center gap-3 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-sm">
              <span>
                <span className="font-mono text-xs text-muted-foreground">{formatEntityId(element.code)}</span> {element.name}
              </span>
              {details}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="rounded-full"
                aria-label={t('ui:removeNamed', { name: `${formatEntityId(element.code)} ${element.name}` })}
                onClick={() => onRemove(element)}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="justify-self-start border-dashed" disabled={candidates.length === 0}>
            <Plus aria-hidden="true" />
            {t('ui:addElement', { element: elementLabel })}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {candidates.map((candidate) => (
            <DropdownMenuItem key={candidate.id} onSelect={() => onAdd(candidate)}>
              <span className="font-mono text-xs text-muted-foreground">{formatEntityId(candidate.code)}</span> {candidate.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
