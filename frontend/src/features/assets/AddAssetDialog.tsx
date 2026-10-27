import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Asset, CiaProperty } from './headlampAssets'

const PROPERTIES: { value: CiaProperty; label: string }[] = [
  { value: 'C', label: 'Confidentiality' },
  { value: 'I', label: 'Integrity' },
  { value: 'A', label: 'Availability' },
]

/** Example of a shadcn/ui dialog with a small form. */
export function AddAssetDialog({ onAdd }: { onAdd: (asset: Omit<Asset, 'id'>) => void }) {
  const [open, setOpen] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onAdd({
      name: String(form.get('name')),
      component: String(form.get('component')),
      properties: PROPERTIES.map((p) => p.value).filter((value) => form.has(value)),
    })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add asset</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add asset</DialogTitle>
            <DialogDescription>Assets are not saved yet, this is only an example.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="asset-name">Name</Label>
            <Input id="asset-name" name="name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="asset-component">Component</Label>
            <Input id="asset-component" name="component" required />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Cybersecurity properties</legend>
            {PROPERTIES.map((p) => (
              <Label key={p.value} className="font-normal">
                <input type="checkbox" name={p.value} />
                {p.label}
              </Label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
