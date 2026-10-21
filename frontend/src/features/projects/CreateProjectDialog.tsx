
import { useState } from 'react'
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

type CreateProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateProject: (name: string) => void
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreateProject,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('')

  function handleCreate() {
    const trimmedName = name.trim()

    if (!trimmedName) return

    onCreateProject(trimmedName)
    setName('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            disabled={!name.trim()}
            onClick={handleCreate}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
