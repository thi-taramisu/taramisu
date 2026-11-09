import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ListTree } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface CreatedElement {
  name: string
  path: string
}

interface CreateElementDialogProps {
  title: string
  description: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Gets the focus back on close; opened from a menu, the dialog would otherwise drop it after Cancel. */
  returnFocusTo?: HTMLButtonElement | null
  /** Name to start with, e.g. typed into a search before. */
  initialName?: string
  namePlaceholder: string
  nameMaxLength?: number
  /** Where the new element shows up, e.g. in the tree. */
  hint: string
  /** Shown when `onCreate` rejects. */
  errorMessage: string
  /** Creates the element with the trimmed name; resolves to undefined if the other fields are invalid. */
  onCreate: (name: string, form: HTMLFormElement) => Promise<CreatedElement | undefined>
  /** Resets the other fields after "Create & add another" and on close. */
  onReset?: () => void
  /** Fields below the name. */
  children?: ReactNode
}

/**
 * "+ New → …" dialog (interactive wireframe) with the name, "Create & add another" and "Create & open";
 * opens on top of the current page, no own route.
 */
export function CreateElementDialog({
  title,
  description,
  open,
  onOpenChange,
  returnFocusTo,
  initialName = '',
  namePlaceholder,
  nameMaxLength,
  hint,
  errorMessage,
  onCreate,
  onReset,
  children,
}: CreateElementDialogProps) {
  const id = useId()
  const navigate = useNavigate()
  const [name, setName] = useState(initialName)
  const [nameError, setNameError] = useState<string>()
  const [created, setCreated] = useState<string>()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  // Set by "Create & add another"; Enter and "Create & open" submit without it.
  const addAnother = useRef(false)

  function reset() {
    setName('')
    setNameError(undefined)
    setFailed(false)
    onReset?.()
  }

  function close() {
    reset()
    setCreated(undefined)
    onOpenChange(false)
  }

  function handleOpenChange(next: boolean) {
    // Closing while the request runs would drop its navigation and invite a duplicate create.
    if (!next && pending) return
    if (next) onOpenChange(true)
    else close()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const another = addAnother.current
    addAnother.current = false
    if (pending) return
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Name is required.')
      return
    }
    setPending(true)
    setFailed(false)
    try {
      const element = await onCreate(trimmed, event.currentTarget)
      if (!element) return
      if (another) {
        reset()
        setCreated(`${element.name} created.`)
      } else {
        close()
        navigate(element.path)
      }
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          if (returnFocusTo?.isConnected) {
            event.preventDefault()
            returnFocusTo.focus()
          }
        }}
      >
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Name *</Label>
            <Input
              id={`${id}-name`}
              value={name}
              required
              maxLength={nameMaxLength}
              placeholder={namePlaceholder}
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
          {children}
          <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <ListTree aria-hidden="true" className="size-3.5" />
            {hint}
          </p>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}
          <DialogFooter className="items-center">
            <output className="mr-auto text-sm text-muted-foreground">{created}</output>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-disabled={pending}
              onClick={() => {
                if (pending) return
                addAnother.current = true
                formRef.current?.requestSubmit()
              }}
            >
              Create &amp; add another
            </Button>
            {/* aria-disabled instead of disabled keeps the focus on the button while the request runs. */}
            <Button type="submit" aria-disabled={pending}>
              Create &amp; open
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
