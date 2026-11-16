import { Outlet, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { isNotFound } from '../../api/errors'
import { useProject } from '../../api/queries/projects'
import { useProjectTree } from '../../api/queries/items'
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

  if (project.isError) return isNotFound(project.error) ? <NotFoundPage /> : (
    <main className="space-y-3 p-6">
      <p role="alert">The project could not be loaded.</p>
      <Button variant="outline" onClick={() => void project.refetch()}>Retry</Button>
    </main>
  )

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
      <div className="flex min-h-0 flex-1">
        <ResizableSidebar label="Project elements" className="bg-sidebar p-2 text-sidebar-foreground">
          <div className="mb-1 flex items-center justify-between gap-2 px-1.5">
            <h2 className="text-xs font-medium text-muted-foreground">Project elements</h2>
            <fieldset disabled={!project.data}>
              <NewElementMenu projectId={projectId} projectName={project.data?.name ?? 'Project'} />
            </fieldset>
          </div>
          {tree.data ? (
            <Filetree nodes={tree.data} projectId={projectId} />
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">{tree.isError ? 'The elements could not be loaded.' : 'Loading…'}</p>
          )}
        </ResizableSidebar>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {project.data ? <Outlet /> : <output>Loading project…</output>}
        </main>
      </div>
    </div>
  )
}
