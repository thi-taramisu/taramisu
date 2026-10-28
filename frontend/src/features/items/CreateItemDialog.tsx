import { useId, useRef, useState, type FormEvent } from 'react'
import { ListTree } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { entityPath } from '../workspace/entities'
import { ITEM_NAME_MAX_LENGTH, type ScopeType } from '../../api/models/item'
import { useCreateItem } from '../../api/queries/items'

const SCOPE_TYPES: { value: ScopeType; label: string }[] = [
  { value: 'ITEM', label: 'Item (item definition, WP-09-01)' },
  { value: 'COMPONENT', label: 'Component (cybersecurity specification, WP-10-01)' },
]

const LIFECYCLE_PHASES = ['Concept', 'Product development', 'Post-development']

interface CreateItemDialogProps {
  projectId: string
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** "+ New → Item" from the interactive wireframe; opens on top of the current page, no own route. */
export function CreateItemDialog({ projectId, projectName, open, onOpenChange }: CreateItemDialogProps) {
  const id = useId()
  const navigate = useNavigate()
  const createItem = useCreateItem(projectId)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string>()
  const [created, setCreated] = useState<string>()
  const formRef = useRef<HTMLFormElement>(null)
  // Set by "Create & add another"; Enter and "Create & open" submit without it.
  const addAnother = useRef(false)

  function reset() {
    setName('')
    setNameError(undefined)
    createItem.reset()
  }

  function handleOpenChange(next: boolean) {
    // Closing while the request runs would drop its navigation and invite a duplicate create.
    if (!next && createItem.isPending) return
    if (!next) {
      reset()
      setCreated(undefined)
    }
    onOpenChange(next)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const another = addAnother.current
    addAnother.current = false
    if (createItem.isPending) return
    const form = new FormData(event.currentTarget)
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Name is required.')
      return
    }
    createItem.mutate(
      { name: trimmed, scope_type: form.get('scope_type') as ScopeType, lifecycle_phase: String(form.get('lifecycle_phase')) },
      {
        onSuccess: (item) => {
          if (another) {
            reset()
            setCreated(`${item.name} created.`)
          } else {
            handleOpenChange(false)
            navigate(entityPath(projectId, 'items', item.id))
          }
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New Item</DialogTitle>
            <DialogDescription>in project {projectName} · details follow in the item definition</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Name *</Label>
            <Input
              id={`${id}-name`}
              value={name}
              required
              maxLength={ITEM_NAME_MAX_LENGTH}
              placeholder="e.g. Charging Control Unit"
              onChange={(event) => {
                setName(event.target.value)
                setNameError(undefined)
                setCreated(undefined)
              }}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? `${id}-name-error` : undefined}
            />
            {nameError && (
              <p id={`${id}-name-error`} role="alert" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-scope`}>Scope type</Label>
              <NativeSelect id={`${id}-scope`} name="scope_type" defaultValue="ITEM" className="w-full">
                {SCOPE_TYPES.map((scope) => (
                  <NativeSelectOption key={scope.value} value={scope.value}>
                    {scope.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-phase`}>Lifecycle phase</Label>
              <NativeSelect id={`${id}-phase`} name="lifecycle_phase" defaultValue="Concept" className="w-full">
                {LIFECYCLE_PHASES.map((phase) => (
                  <NativeSelectOption key={phase} value={phase}>
                    {phase}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <ListTree aria-hidden="true" className="size-3.5" />
            Will appear in the tree as a new item.
          </p>
          {createItem.isError && (
            <p role="alert" className="text-sm text-destructive">
              The item could not be created. Please try again.
            </p>
          )}
          <DialogFooter className="items-center">
            <output className="mr-auto text-sm text-muted-foreground">{created}</output>
            <Button type="button" variant="ghost" disabled={createItem.isPending} onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-disabled={createItem.isPending}
              onClick={() => {
                if (createItem.isPending) return
                addAnother.current = true
                formRef.current?.requestSubmit()
              }}
            >
              Create &amp; add another
            </Button>
            {/* aria-disabled instead of disabled keeps the focus on the button while the request runs. */}
            <Button type="submit" aria-disabled={createItem.isPending}>
              Create &amp; open
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
