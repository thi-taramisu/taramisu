import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
          {t('ui:addMember')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('ui:addMember')}</DialogTitle>
            <DialogDescription>{t('ui:mockMembersHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="member-email">{t('ui:email')}</Label>
            <Input id="member-email" name="email" type="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="member-role">{t('ui:role')}</Label>
            <NativeSelect id="member-role" name="role" defaultValue={DEFAULT_PROJECT_ROLE} className="w-full">
              {PROJECT_ROLES.map(({ value, label }) => (
                <NativeSelectOption key={value} value={value}>
                  {t(label)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter>
            <Button type="submit">{t('ui:save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
