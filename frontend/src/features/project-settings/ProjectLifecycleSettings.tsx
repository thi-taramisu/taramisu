import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArchiveProjectDialog } from '@/features/projects/ArchiveProjectDialog'
import { DeleteProjectDialog } from '@/features/projects/DeleteProjectDialog'
import { changeError } from '@/features/projects/changeError'
import {
  resetFailed,
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

/** "Danger Zone" of the project settings: archive, restore and delete. Only Owners see it. */
export function ProjectLifecycleSettings({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const project = useProject(projectId)
  const archiveProject = useArchiveProject()
  const restoreProject = useRestoreProject()
  const deleteProject = useDeleteProject()
  const [openDialog, setOpenDialog] = useState<'archive' | 'delete' | null>(null)
  // Kept after closing, so the dialog can return focus to the button that opened it.
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null)

  function open(dialog: 'archive' | 'delete', button: HTMLButtonElement) {
    setOpener(button)
    setOpenDialog(dialog)
  }

  function close(isOpen: boolean) {
    if (!isOpen) setOpenDialog(null)
  }

  // Load errors are shown by the General section (`GeneralSettings.tsx`); without the project nothing is offered.
  if (project.data?.role !== 'OWNER') return null

  const { name, archived } = project.data
  const pending = archiveProject.isPending || restoreProject.isPending || deleteProject.isPending
  const mutations = [archiveProject, restoreProject, deleteProject]
  const failed = mutations.find((mutation) => mutation.isError)

  return (
    <section aria-labelledby="danger-zone" className="grid gap-3">
      <h2 id="danger-zone" className="text-base font-semibold">Danger Zone</h2>
      <div className="divide-y rounded-lg border border-destructive/30">
        {archived ? (
          <SettingRow
            title="Restore project"
            action={(
              <Button variant="outline" disabled={pending} onClick={() => {
                resetFailed(...mutations)
                restoreProject.mutate(projectId)
              }}>
                <ArchiveRestore aria-hidden="true" />
                Restore Project
              </Button>
            )}
          >
            This project is archived and read-only for all members. Restore it to allow changes again.
          </SettingRow>
        ) : (
          <SettingRow
            title="Archive project"
            action={(
              <Button variant="outline" disabled={pending} onClick={(event) => open('archive', event.currentTarget)}>
                <Archive aria-hidden="true" />
                Archive Project
              </Button>
            )}
          >
            Archive this project to make it read-only for all members. Owners can restore it at any time.
          </SettingRow>
        )}
        <SettingRow
          title="Delete project"
          action={(
            <Button
              variant="destructive"
              disabled={pending}
              onClick={(event) => open('delete', event.currentTarget)}
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
          {changeError(failed.error)}
        </p>
      )}

      <ArchiveProjectDialog
        projectName={openDialog === 'archive' ? name : null}
        onOpenChange={close}
        onConfirm={() => {
          resetFailed(...mutations)
          archiveProject.mutate(projectId)
        }}
        returnFocusTo={opener}
      />

      <DeleteProjectDialog
        projectName={openDialog === 'delete' ? name : null}
        onOpenChange={close}
        onConfirm={() => {
          // A second confirm while the request runs would delete twice and report the second 404.
          if (deleteProject.isPending) return
          resetFailed(...mutations)
          deleteProject.mutate(projectId, {
            onSuccess: () => navigate('/projects'),
            onError: () => setOpenDialog(null),
          })
        }}
        returnFocusTo={opener}
      />
    </section>
  )
}
