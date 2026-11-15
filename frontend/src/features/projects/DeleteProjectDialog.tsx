import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type DeleteProjectDialogProps = {
  projectName: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  returnFocusTo?: HTMLButtonElement | null
}

type Step = 'acknowledge' | 'confirm'

/** Two-step confirmation before deleting a project: acknowledge the warning, then type the project name. */
export function DeleteProjectDialog({
  projectName,
  onOpenChange,
  onConfirm,
  returnFocusTo,
}: DeleteProjectDialogProps) {
  const [step, setStep] = useState<Step>('acknowledge')

  return (
    <AlertDialog
      open={projectName !== null}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent
        // The confirm step has no warning text, so the dialog has no description there.
        {...(step === 'confirm' && { 'aria-describedby': undefined })}
        onCloseAutoFocus={(event) => {
          // Runs after the close animation, so the dialog does not jump back to the first step while fading out.
          setStep('acknowledge')
          if (returnFocusTo?.isConnected) {
            event.preventDefault()
            returnFocusTo.focus()
          }
        }}
      >
        {/* The form unmounts with the closed dialog, which clears the typed name. */}
        <DeleteProjectForm
          projectName={projectName ?? ''}
          step={step}
          onContinue={() => setStep('confirm')}
          onConfirm={onConfirm}
        />
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteProjectForm({
  projectName,
  step,
  onContinue,
  onConfirm,
}: {
  projectName: string
  step: Step
  onContinue: () => void
  onConfirm: () => void
}) {
  const inputId = useId()
  const [confirmation, setConfirmation] = useState('')
  const matches = projectName !== '' && confirmation === projectName
  const inputRef = useRef<HTMLInputElement>(null)

  // The first step's button unmounts, so focus moves to the field instead of being lost.
  useEffect(() => {
    if (step === 'confirm') inputRef.current?.focus()
  }, [step])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (matches) onConfirm()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <AlertDialogHeader>
        {/* Keep repeated spaces visible, as the name must be typed exactly, and break long names. */}
        <AlertDialogTitle className="whitespace-pre-wrap wrap-anywhere">Delete {projectName}</AlertDialogTitle>
        {step === 'acknowledge' && (
          <AlertDialogDescription>
            This will permanently delete the project, including all of its items, their content, and its stored
            files. Everything will be permanently lost and cannot be restored.
          </AlertDialogDescription>
        )}
      </AlertDialogHeader>

      {step === 'confirm' && (
        <div className="space-y-2">
          <Label htmlFor={inputId}>
            <span className="whitespace-pre-wrap wrap-anywhere">
              To confirm, type &quot;{projectName}&quot; in the box below
            </span>
          </Label>
          <Input
            id={inputId}
            ref={inputRef}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel type="button">Cancel</AlertDialogCancel>

        {step === 'acknowledge' ? (
          <Button
            type="button"
            variant="destructive"
            onClick={onContinue}
          >
            Delete Project
          </Button>
        ) : (
          <Button
            type="submit"
            variant="destructive"
            disabled={!matches}
          >
            Delete Project
          </Button>
        )}
      </AlertDialogFooter>
    </form>
  )
}
