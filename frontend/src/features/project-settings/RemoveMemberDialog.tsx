import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Member } from '../../api/models/project'

interface RemoveMemberDialogProps {
  /** Member to confirm, null keeps the dialog closed. */
  member: Member | null
  onCancel: () => void
  onConfirm: (member: Member) => void
}

export function RemoveMemberDialog({ member, onCancel, onConfirm }: RemoveMemberDialogProps) {
  const { t } = useTranslation()
  // Keep showing the last member while the dialog animates out, so the email does not disappear.
  const [shownMember, setShownMember] = useState(member)
  if (member && member !== shownMember) setShownMember(member)

  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ui:removeMemberTitle')}</DialogTitle>
          <DialogDescription>
            {t('ui:removeMemberDescription', { email: shownMember?.email })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t('ui:cancel')}</Button>
          </DialogClose>
          <Button variant="destructive" onClick={() => member && onConfirm(member)}>
            {t('ui:remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
