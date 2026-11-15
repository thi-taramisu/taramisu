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
          <AlertDialogTitle className="whitespace-pre-wrap wrap-anywhere">Archive {projectName}</AlertDialogTitle>
          <AlertDialogDescription>
            This will make the project read-only for all members. Owners can restore it at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Archive Project</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
