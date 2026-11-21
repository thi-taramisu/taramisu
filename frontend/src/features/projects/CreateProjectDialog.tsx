
import { useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProjectImageInput } from '@/features/project-settings/ProjectImageInput'

type CreateProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateProject: (name: string, image?: File) => void
  returnFocusTo?: HTMLButtonElement | null
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreateProject,
  returnFocusTo,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedName = name.trim()

    if (!trimmedName) return

    const imageInput = event.currentTarget.elements.namedItem('image') as HTMLInputElement | null
    const image = imageInput?.files?.[0]
    if (image) {
      onCreateProject(trimmedName, image)
    } else {
      onCreateProject(trimmedName)
    }
    setName('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (returnFocusTo?.isConnected) {
            event.preventDefault()
            returnFocusTo.focus()
          }
        }}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Enter a name for your new TARA project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter project name"
              autoComplete="off"
            />
          </div>

          <ProjectImageInput defaultValue={null} />
          <p className="text-xs text-muted-foreground">
            Optional. PNG, JPEG or WebP, up to 5 MB.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={!name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
