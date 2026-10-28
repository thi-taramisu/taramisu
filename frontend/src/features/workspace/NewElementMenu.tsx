import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CreateItemDialog } from '../items/CreateItemDialog'

// Only items can be created so far; the other types follow with their own tickets.
const OTHER_TYPES = ['Asset', 'Damage Scenario', 'Threat Scenario', 'Attack Path']

/** "+ New" button above the element tree (Add Items wireframes). */
export function NewElementMenu({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [itemDialogOpen, setItemDialogOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus aria-hidden="true" />
            New
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={() => setItemDialogOpen(true)}>Item</DropdownMenuItem>
          {OTHER_TYPES.map((label) => (
            <DropdownMenuItem key={label} disabled>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateItemDialog projectId={projectId} projectName={projectName} open={itemDialogOpen} onOpenChange={setItemDialogOpen} />
    </>
  )
}
