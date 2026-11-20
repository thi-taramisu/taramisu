import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { generatedProjectImage } from '../projects/projectImageSource'
import { headlampDetails } from '../../api/mocks/data/projectSettings'
import { useProjectAccess } from '../../api/queries/projects'
import { ProjectImageInput } from './ProjectImageInput'
import { ProjectLifecycleSettings } from './ProjectLifecycleSettings'

function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
}

export function GeneralSettings() {
  const { projectId = '' } = useParams()
  const { canEdit } = useProjectAccess(projectId)

  return (
    <div className="grid gap-8">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <h1 className="text-lg font-semibold">General</h1>
        {/* Read-only projects show the details disabled and no Save; members stay editable until #233 decides. */}
        <fieldset disabled={!canEdit} className="contents">
          <div className="grid gap-2">
            <Label htmlFor="project-name">Name</Label>
            {/* The pattern also rejects names that only contain spaces. */}
            <Input id="project-name" name="name" defaultValue={headlampDetails.name} required pattern=".*\S.*" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea id="project-description" name="description" defaultValue={headlampDetails.description} className="min-h-32" />
          </div>
          <ProjectImageInput defaultValue={headlampDetails.image} generatedImage={generatedProjectImage(projectId)} />
        </fieldset>
        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit">Save</Button>
          </div>
        )}
      </form>
      {/* Outside the form, so its buttons do not submit it. */}
      <ProjectLifecycleSettings projectId={projectId} />
    </div>
  )
}
