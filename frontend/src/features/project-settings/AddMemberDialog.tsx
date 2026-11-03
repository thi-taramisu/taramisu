import { type FormEvent, useState } from 'react'
import { Plus } from 'lucide-react'
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { Member, ProjectRole } from '../../api/models/project'
import { DEFAULT_PROJECT_ROLE, PROJECT_ROLES } from './roles'

export function AddMemberDialog({ onAdd }: { onAdd: (member: Omit<Member, 'id' | 'added'>) => void }) {
  const [open, setOpen] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onAdd({ email: String(form.get('email')), role: form.get('role') as ProjectRole })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Add member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>Members are not saved yet, this is only an example.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="member-email">Email</Label>
            <Input id="member-email" name="email" type="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="member-role">Role</Label>
            <NativeSelect id="member-role" name="role" defaultValue={DEFAULT_PROJECT_ROLE} className="w-full">
              {PROJECT_ROLES.map(({ value, label }) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
