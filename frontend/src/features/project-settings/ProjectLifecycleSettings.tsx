import { useTranslation } from 'react-i18next'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArchiveProjectDialog } from '@/features/projects/ArchiveProjectDialog'
import { DeleteProjectDialog } from '@/features/projects/DeleteProjectDialog'
import { isNotFound } from '../../api/errors'
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
  const { t } = useTranslation()
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

  // A 404 is handled by the settings page; other errors must not look like missing rights.
  if (project.isError && !isNotFound(project.error)) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p role="alert" className="text-sm text-destructive">{t('ui:theArchiveAndDeleteOptionsCouldNotBeLoaded')}</p>
        <Button variant="outline" size="sm" onClick={() => void project.refetch()}>{t('ui:retry')}</Button>
      </div>
    )
  }

  if (project.data?.role !== 'OWNER') return null

  const { name, archived } = project.data
  const pending = archiveProject.isPending || restoreProject.isPending || deleteProject.isPending
  const mutations = [archiveProject, restoreProject, deleteProject]
  const failed = mutations.some((mutation) => mutation.isError)

  return (
    <section aria-labelledby="danger-zone" className="grid gap-3">
      <h2 id="danger-zone" className="text-base font-semibold">{t('ui:dangerZone')}</h2>
      <div className="divide-y rounded-lg border border-destructive/30">
        {archived ? (
          <SettingRow
            title={t('ui:restoreProjectText')}
            action={(
              <Button variant="outline" disabled={pending} onClick={() => {
                resetFailed(...mutations)
                restoreProject.mutate(projectId)
              }}>
                <ArchiveRestore aria-hidden="true" />{t('ui:restoreProject')}</Button>
            )}
          >{t('ui:thisProjectIsArchivedAndReadonlyForAllMembersRestoreItToAllowChangesAgain')}</SettingRow>
        ) : (
          <SettingRow
            title={t('ui:archiveProjectText')}
            action={(
              <Button variant="outline" disabled={pending} onClick={(event) => open('archive', event.currentTarget)}>
                <Archive aria-hidden="true" />{t('ui:archiveProject')}</Button>
            )}
          >{t('ui:archiveThisProjectToMakeItReadonlyForAllMembersOwnersCanRestoreItAtAnyTime')}</SettingRow>
        )}
        <SettingRow
          title={t('ui:deleteProjectText')}
          action={(
            <Button
              variant="destructive"
              disabled={pending}
              onClick={(event) => open('delete', event.currentTarget)}
            >
              <Trash2 aria-hidden="true" />{t('ui:deleteProject')}</Button>
          )}
        >{t('ui:permanentlyDeleteTheProjectWithEverythingInItThisCannotBeUndone')}</SettingRow>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">{t('ui:theChangeCouldNotBeSavedPleaseTryAgain')}</p>
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
