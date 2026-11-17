import { Outlet, useParams, useSearchParams } from 'react-router-dom'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { isNotFound } from '../../api/errors'
import { useProjectTree } from '../../api/queries/items'
import { useProject, useProjectAccess } from '../../api/queries/projects'
import { ArchivedProjectBanner } from '../projects/ArchivedProjectBanner'
import { Filetree } from './Filetree'
import { NewElementMenu } from './NewElementMenu'
import { ProjectHeader } from './ProjectHeader'
import { ResizableSidebar } from './ResizableSidebar'

/** Project workspace from the Concept 2 wireframes: header with graph toggle, element tree, content. */
export function WorkspaceLayout() {
  const { projectId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const graphView = searchParams.get('view') === 'graph'
  const project = useProject(projectId)
  const tree = useProjectTree(projectId, { enabled: Boolean(project.data) })
  const { canEdit } = useProjectAccess(projectId)

  // Deleted and unknown projects have no workspace.
  if (isNotFound(project.error)) return <NotFoundPage />

  return (
    <div className="flex h-screen flex-col">
      <ProjectHeader projectId={projectId} projectName={project.data?.name ?? 'Loading project…'}>
        <Switch
          id="graph-view"
          checked={graphView}
          onCheckedChange={(checked) => setSearchParams(checked ? { view: 'graph' } : {})}
        />
        <Label htmlFor="graph-view">Graph</Label>
      </ProjectHeader>
      <ArchivedProjectBanner projectId={projectId} />
      {/* Without the project nothing can be edited, so a failed load must not look like a read-only project. */}
      {project.isError && (
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <p role="alert" className="text-sm text-destructive">The project could not be loaded, so it cannot be edited.</p>
          <Button variant="outline" size="sm" onClick={() => void project.refetch()}>
            Retry
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <ResizableSidebar label="Project elements" className="bg-sidebar p-2 text-sidebar-foreground">
          <div className="mb-1 flex items-center justify-between gap-2 px-1.5">
            <h2 className="text-xs font-medium text-muted-foreground">Project elements</h2>
            <NewElementMenu projectId={projectId} projectName={project.data?.name ?? 'Project'} disabled={!canEdit} />
          </div>
          {tree.data ? (
            <Filetree nodes={tree.data} projectId={projectId} />
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">{tree.isError ? 'The elements could not be loaded.' : 'Loading…'}</p>
          )}
        </ResizableSidebar>
        {/* relative keeps absolutely positioned content such as sr-only text inside the scroll area; it would extend the page otherwise. */}
        <main className="relative min-w-0 flex-1 overflow-y-auto p-6">
          {project.data ? <Outlet /> : <output>Loading project…</output>}
        </main>
      </div>
    </div>
  )
}
