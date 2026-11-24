import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type ArchiveProjectDialogProps = {
  projectName: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  returnFocusTo?: HTMLButtonElement | null
}

/** One-step confirmation before archiving a project; archiving can be undone, unlike deleting. */
export function ArchiveProjectDialog({
  projectName,
  onOpenChange,
  onConfirm,
  returnFocusTo,
}: ArchiveProjectDialogProps) {
  const { t } = useTranslation()
  return (
    <AlertDialog
      open={projectName !== null}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (returnFocusTo?.isConnected) {
            event.preventDefault()
            returnFocusTo.focus()
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="whitespace-pre-wrap wrap-anywhere">{t('ui:archiveName', { name: projectName })}</AlertDialogTitle>
          <AlertDialogDescription>{t('ui:thisWillMakeTheProjectAndAllOfItsContentReadonlyForAllMembersOwnersCanRestoreItAtAnyTimeFromTheArchiveOrTheProjectSettings')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('ui:cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('ui:archiveProject')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
