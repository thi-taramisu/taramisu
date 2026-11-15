import { Trans, useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type DeleteProjectDialogProps = {
  projectName: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  returnFocusTo?: HTMLButtonElement | null
}

export function DeleteProjectDialog({
  projectName,
  onOpenChange,
  onConfirm,
  returnFocusTo,
}: DeleteProjectDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={projectName !== null}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (returnFocusTo?.isConnected) {
            event.preventDefault()
            returnFocusTo.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('ui:deleteProjectTitle')}</DialogTitle>
          <DialogDescription>
            <Trans t={t} i18nKey="ui:deleteProjectDescription" values={{ name: projectName }} components={{ strong: <strong /> }} />
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('ui:cancel')}
          </Button>

          <Button
            variant="destructive"
            onClick={onConfirm}
          >
            {t('ui:deleteProject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
