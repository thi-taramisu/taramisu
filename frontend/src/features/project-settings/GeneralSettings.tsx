import { useTranslation } from 'react-i18next'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { headlampDetails } from '../../api/mocks/data/projectSettings'
import { ProjectImageInput } from './ProjectImageInput'

function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
}

export function GeneralSettings() {
  const { t } = useTranslation()
  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <h1 className="text-lg font-semibold">{t('navigation.general')}</h1>
      <div className="grid gap-2">
        <Label htmlFor="project-name">{t('ui:name')}</Label>
        {/* The pattern also rejects names that only contain spaces. */}
        <Input id="project-name" name="name" defaultValue={headlampDetails.name} required pattern=".*\S.*" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-description">{t('ui:description')}</Label>
        <Textarea id="project-description" name="description" defaultValue={headlampDetails.description} className="min-h-32" />
      </div>
      <ProjectImageInput defaultValue={headlampDetails.image} />
      <div className="flex justify-end">
        <Button type="submit">{t('ui:save')}</Button>
      </div>
    </form>
  )
}
