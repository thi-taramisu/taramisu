import { Outlet, useParams, useSearchParams } from 'react-router-dom'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { isNotFound } from '../../api/errors'
import { exampleProject } from '../../api/mocks/data/headlamp'
import { useProjectTree } from '../../api/queries/items'
import { useProject, useProjectAccess } from '../../api/queries/projects'
import { ArchivedProjectBanner } from '../projects/ArchivedProjectBanner'
import { Filetree } from './Filetree'
import { NewElementMenu } from './NewElementMenu'
import { ProjectHeader } from './ProjectHeader'
import { ResizableSidebar } from './ResizableSidebar'
import { useTranslation } from 'react-i18next'

/** Project workspace from the Concept 2 wireframes: header with graph toggle, element tree, content. */
export function WorkspaceLayout() {
  const { t } = useTranslation()
  const { projectId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const graphView = searchParams.get('view') === 'graph'
  const tree = useProjectTree(projectId, { enabled: projectId === exampleProject.id })
  const project = useProject(projectId)
  const { canEdit } = useProjectAccess(projectId)

  // Only the example project has a workspace so far; a deleted project has none.
  if (projectId !== exampleProject.id || isNotFound(project.error)) return <NotFoundPage />

  return (
    <div className="flex h-screen flex-col">
      <ProjectHeader projectId={projectId}>
        <Switch
          id="graph-view"
          checked={graphView}
          onCheckedChange={(checked) => setSearchParams(checked ? { view: 'graph' } : {})}
        />
        <Label htmlFor="graph-view">{t('navigation.graph')}</Label>
      </ProjectHeader>
      <ArchivedProjectBanner projectId={projectId} />
      {/* Without the project nothing can be edited, so a failed load must not look like a read-only project. */}
      {project.isError && (
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <p role="alert" className="text-sm text-destructive">{t('ui:theProjectCouldNotBeLoadedSoItCannotBeEdited')}</p>
          <Button variant="outline" size="sm" onClick={() => void project.refetch()}>{t('ui:retry')}</Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <ResizableSidebar label={t('navigation.projectElements')} resizeLabel={t('navigation.resizeProjectElements')} className="bg-sidebar p-2 text-sidebar-foreground">
          <div className="mb-1 flex items-center justify-between gap-2 px-1.5">
            <h2 className="text-xs font-medium text-muted-foreground">{t('navigation.projectElements')}</h2>
            <NewElementMenu projectId={projectId} projectName={exampleProject.name} disabled={!canEdit} />
          </div>
          {tree.data ? (
            <Filetree nodes={tree.data} projectId={projectId} />
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">{tree.isError ? t('ui:loadElementsError') : t('ui:loading')}</p>
          )}
        </ResizableSidebar>
        {/* relative keeps absolutely positioned content such as sr-only text inside the scroll area; it would extend the page otherwise. */}
        <main className="relative min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
