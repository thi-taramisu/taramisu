import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CreateAttackPathDialog } from '../attack-paths/CreateAttackPathDialog'
import { CreateDamageScenarioDialog } from '../damage-scenarios/CreateDamageScenarioDialog'
import { CreateItemDialog } from '../items/CreateItemDialog'
import { CreateThreatScenarioDialog } from '../threat-scenarios/CreateThreatScenarioDialog'
import { useTranslation } from 'react-i18next'

// Assets cannot be created here yet; they follow with their own ticket.
const OTHER_TYPES = ['assets']

interface NewElementMenuProps {
  projectId: string
  projectName: string
  /** Keeps the button in place, e.g. in a read-only project. */
  disabled?: boolean
}

/** "+ New" button above the element tree (Add Items wireframes). */
export function NewElementMenu({ projectId, projectName, disabled = false }: NewElementMenuProps) {
  const { t } = useTranslation()
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [damageScenarioDialog, setDamageScenarioDialog] = useState({ open: false, key: 0 })
  const [threatScenarioDialog, setThreatScenarioDialog] = useState({ open: false, key: 0 })
  const [attackPathDialog, setAttackPathDialog] = useState({ open: false, key: 0 })
  // The menu is closed when a dialog opens, so the dialogs return the focus to this button themselves.
  const [newButton, setNewButton] = useState<HTMLButtonElement | null>(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={setNewButton} size="sm" disabled={disabled}>
            <Plus aria-hidden="true" />
            {t('navigation.new')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={() => setItemDialogOpen(true)}>{t('entities.items')}</DropdownMenuItem>
          {/* A new key per opening, so the dialogs start from the item and element of the current page. */}
          <DropdownMenuItem onSelect={() => setDamageScenarioDialog(({ key }) => ({ open: true, key: key + 1 }))}>
            {t('entities.damage-scenarios')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setThreatScenarioDialog(({ key }) => ({ open: true, key: key + 1 }))}>
            {t('entities.threat-scenarios')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAttackPathDialog(({ key }) => ({ open: true, key: key + 1 }))}>
            {t('entities.attack-paths')}
          </DropdownMenuItem>
          {OTHER_TYPES.map((label) => (
            <DropdownMenuItem key={label} disabled>
              {t(`entities.${label}`)}
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
      <CreateDamageScenarioDialog
        key={`damage-scenario-${damageScenarioDialog.key}`}
        projectId={projectId}
        projectName={projectName}
        open={damageScenarioDialog.open}
        onOpenChange={(open) => setDamageScenarioDialog((prev) => ({ ...prev, open }))}
        returnFocusTo={newButton}
      />
      <CreateThreatScenarioDialog
        key={`threat-scenario-${threatScenarioDialog.key}`}
        projectId={projectId}
        projectName={projectName}
        open={threatScenarioDialog.open}
        onOpenChange={(open) => setThreatScenarioDialog((prev) => ({ ...prev, open }))}
        returnFocusTo={newButton}
      />
      <CreateAttackPathDialog
        key={`attack-path-${attackPathDialog.key}`}
        projectId={projectId}
        projectName={projectName}
        open={attackPathDialog.open}
        onOpenChange={(open) => setAttackPathDialog((prev) => ({ ...prev, open }))}
        returnFocusTo={newButton}
      />
    </>
  )
}
