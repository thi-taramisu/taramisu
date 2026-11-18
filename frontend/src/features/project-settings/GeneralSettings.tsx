import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { generatedProjectImage } from '../projects/projectImageSource'
import { ApiError, isNotFound } from '../../api/errors'
import type { Project } from '../../api/models/project'
import { resetFailed, useProject, useProjectAccess, useUpdateProject } from '../../api/queries/projects'
import { ProjectImageInput } from './ProjectImageInput'
import { ProjectLifecycleSettings } from './ProjectLifecycleSettings'

function saveError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return 'Only editors and owners can change the project.'
  return 'The project could not be saved. Please try again.'
}

/** Name, description and image; Save sends name and description, the image is not uploaded yet (#231). */
function DetailsForm({ project }: { project: Project }) {
  const { canEdit } = useProjectAccess(project.id)
  const updateProject = useUpdateProject()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (updateProject.isPending) return
    const form = new FormData(event.currentTarget)
    updateProject.mutate({
      projectId: project.id,
      name: String(form.get('name') ?? ''),
      description: String(form.get('description') ?? ''),
    })
  }

  return (
    // A change after saving hides "Saved" and an old error, so neither describes values that were not sent.
    <form
      onSubmit={handleSubmit}
      onChange={() => {
        if (updateProject.isSuccess) updateProject.reset()
        resetFailed(updateProject)
      }}
      className="grid gap-4"
    >
      <h1 className="text-lg font-semibold">General</h1>
      {/* Read-only projects show the details disabled and no Save; members stay editable until #233 decides. */}
      <fieldset disabled={!canEdit} className="contents">
        <div className="grid gap-2">
          <Label htmlFor="project-name">Name</Label>
          {/* The pattern also rejects names that only contain spaces. */}
          <Input id="project-name" name="name" defaultValue={project.name} required pattern=".*\S.*" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="project-description">Description</Label>
          <Textarea id="project-description" name="description" defaultValue={project.description} className="min-h-32" />
        </div>
        <ProjectImageInput defaultValue={project.image ?? null} generatedImage={generatedProjectImage(project.id)} />
      </fieldset>
      {updateProject.isError && (
        <p role="alert" className="text-sm text-destructive">
          {saveError(updateProject.error)}
        </p>
      )}
      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          <output className="text-sm text-muted-foreground">
            {updateProject.isSuccess ? 'Saved.' : ''}
          </output>
          <Button type="submit" disabled={updateProject.isPending}>
            {updateProject.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </form>
  )
}

export function GeneralSettings() {
  const { projectId = '' } = useParams()
  const project = useProject(projectId)

  return (
    <div className="grid gap-8">
      {project.isPending && <p className="text-sm text-muted-foreground">Loading project…</p>}
      {/* A 404 is handled by the settings page. */}
      {project.isError && !isNotFound(project.error) && (
        <div className="flex items-center justify-between gap-2">
          <p role="alert" className="text-sm text-destructive">
            The project could not be loaded.
          </p>
          <Button variant="outline" size="sm" onClick={() => void project.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {/* Keyed by the project, so the fields show its values when another project's settings open. */}
      {project.data && <DetailsForm key={project.data.id} project={project.data} />}
      {/* Outside the form, so its buttons do not submit it. */}
      <ProjectLifecycleSettings projectId={projectId} />
    </div>
  )
}
