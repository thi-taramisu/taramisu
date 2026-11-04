import { Outlet, useParams, useSearchParams } from 'react-router-dom'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { exampleProject } from '../../api/mocks/data/headlamp'
import { useProjectTree } from '../../api/queries/items'
import { Filetree } from './Filetree'
import { NewElementMenu } from './NewElementMenu'
import { ProjectHeader } from './ProjectHeader'

/** Project workspace from the Concept 2 wireframes: header with graph toggle, element tree, content. */
export function WorkspaceLayout() {
  const { projectId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const graphView = searchParams.get('view') === 'graph'
  const tree = useProjectTree(projectId, { enabled: projectId === exampleProject.id })

  if (projectId !== exampleProject.id) return <NotFoundPage />

  return (
    <div className="flex h-screen flex-col">
      <ProjectHeader projectId={projectId}>
        <Switch
          id="graph-view"
          checked={graphView}
          onCheckedChange={(checked) => setSearchParams(checked ? { view: 'graph' } : {})}
        />
        <Label htmlFor="graph-view">Graph</Label>
      </ProjectHeader>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Project elements" className="w-72 shrink-0 overflow-y-auto border-r bg-sidebar p-2 text-sidebar-foreground">
          <div className="mb-1 flex items-center justify-between gap-2 px-1.5">
            <h2 className="text-xs font-medium text-muted-foreground">Project elements</h2>
            <NewElementMenu projectId={projectId} projectName={exampleProject.name} />
          </div>
          {tree.data ? (
            <Filetree nodes={tree.data} projectId={projectId} />
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">{tree.isError ? 'The elements could not be loaded.' : 'Loading…'}</p>
          )}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
