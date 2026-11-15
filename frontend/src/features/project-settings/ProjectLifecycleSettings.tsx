import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeleteProjectDialog } from '@/features/projects/DeleteProjectDialog'
import {
  useArchiveProject,
  useDeleteProject,
  useProject,
  useRestoreProject,
} from '../../api/queries/projects'

function SettingRow({ title, children, action }: { title: string; children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
  )
}

/** Archive, restore and delete a project; only Owners see this section. */
export function ProjectLifecycleSettings({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const project = useProject(projectId)
  const archiveProject = useArchiveProject()
  const restoreProject = useRestoreProject()
  const deleteProject = useDeleteProject()
  const [deleteOpener, setDeleteOpener] = useState<HTMLButtonElement | null>(null)

  if (project.data?.role !== 'OWNER') return null

  const { name, archived } = project.data
  const pending = archiveProject.isPending || restoreProject.isPending || deleteProject.isPending
  const failed = archiveProject.isError || restoreProject.isError || deleteProject.isError

  return (
    <section aria-labelledby="project-lifecycle" className="grid gap-3">
      <h2 id="project-lifecycle" className="text-base font-semibold">Archive and delete</h2>
      <div className="divide-y rounded-lg border border-destructive/30">
        {archived ? (
          <SettingRow
            title="Restore project"
            action={(
              <Button variant="outline" disabled={pending} onClick={() => restoreProject.mutate(projectId)}>
                <ArchiveRestore aria-hidden="true" />
                Restore Project
              </Button>
            )}
          >
            This project is archived and read-only. Restore it to allow changes again.
          </SettingRow>
        ) : (
          <SettingRow
            title="Archive project"
            action={(
              <Button variant="outline" disabled={pending} onClick={() => archiveProject.mutate(projectId)}>
                <Archive aria-hidden="true" />
                Archive Project
              </Button>
            )}
          >
            Make the project read-only for all members. Owners can restore it later.
          </SettingRow>
        )}
        <SettingRow
          title="Delete project"
          action={(
            <Button
              variant="destructive"
              disabled={pending}
              onClick={(event) => setDeleteOpener(event.currentTarget)}
            >
              <Trash2 aria-hidden="true" />
              Delete Project
            </Button>
          )}
        >
          Permanently delete the project with everything in it. This cannot be undone.
        </SettingRow>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          The change could not be saved. Please try again.
        </p>
      )}

      <DeleteProjectDialog
        projectName={deleteOpener ? name : null}
        onOpenChange={(open) => {
          if (!open) setDeleteOpener(null)
        }}
        onConfirm={() =>
          deleteProject.mutate(projectId, {
            onSuccess: () => navigate('/projects'),
            onError: () => setDeleteOpener(null),
          })}
        returnFocusTo={deleteOpener}
      />
    </section>
  )
}
