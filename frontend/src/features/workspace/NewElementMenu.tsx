import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CreateAssetDialog } from '../assets/CreateAssetDialog'
import { CreateDamageScenarioDialog } from '../damage-scenarios/CreateDamageScenarioDialog'
import { CreateItemDialog } from '../items/CreateItemDialog'

// Only items, assets and damage scenarios can be created so far; the other types follow with their own tickets.
const OTHER_TYPES = ['Threat Scenario', 'Attack Path']

/** "+ New" button above the element tree (Add Items wireframes). */
export function NewElementMenu({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [assetDialog, setAssetDialog] = useState({ open: false, key: 0 })
  const [damageScenarioDialog, setDamageScenarioDialog] = useState({ open: false, key: 0 })
  // The menu is closed when a dialog opens, so the dialogs return the focus to this button themselves.
  const [newButton, setNewButton] = useState<HTMLButtonElement | null>(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={setNewButton} size="sm">
            <Plus aria-hidden="true" />
            New
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={() => setItemDialogOpen(true)}>Item</DropdownMenuItem>
          {/* A new key per opening, so the dialogs start from the item (and asset) of the current page. */}
          <DropdownMenuItem onSelect={() => setAssetDialog(({ key }) => ({ open: true, key: key + 1 }))}>Asset</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDamageScenarioDialog(({ key }) => ({ open: true, key: key + 1 }))}>
            Damage Scenario
          </DropdownMenuItem>
          {OTHER_TYPES.map((label) => (
            <DropdownMenuItem key={label} disabled>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateItemDialog
        projectId={projectId}
        projectName={projectName}
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        returnFocusTo={newButton}
      />
      <CreateAssetDialog
        key={`asset-${assetDialog.key}`}
        projectId={projectId}
        projectName={projectName}
        open={assetDialog.open}
        onOpenChange={(open) => setAssetDialog((prev) => ({ ...prev, open }))}
        returnFocusTo={newButton}
      />
      <CreateDamageScenarioDialog
        key={`damage-scenario-${damageScenarioDialog.key}`}
        projectId={projectId}
        projectName={projectName}
        open={damageScenarioDialog.open}
        onOpenChange={(open) => setDamageScenarioDialog((prev) => ({ ...prev, open }))}
        returnFocusTo={newButton}
      />
    </>
  )
}
