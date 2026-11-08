import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { EntityRef } from '../../api/models/tree'

interface AddRelationMenuProps<T extends EntityRef> {
  label: string
  /** Elements that can still be linked; the button is disabled without any. */
  options: T[]
  onAdd: (option: T) => void
  /** Keeps the menu closed while a request runs; the focus stays on the button. */
  pending?: boolean
  className?: string
}

/** "+ Add …" button with the existing elements that can be linked. */
export function AddRelationMenu<T extends EntityRef>({ label, options, onAdd, pending = false, className }: AddRelationMenuProps<T>) {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={(next) => setOpen(next && !pending)}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={className} aria-disabled={pending} disabled={options.length === 0}>
          <Plus aria-hidden="true" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuItem key={option.id} onSelect={() => onAdd(option)}>
            <span className="font-mono text-xs text-muted-foreground">{option.code}</span> {option.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
