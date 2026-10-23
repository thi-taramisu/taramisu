import { Link, Outlet, useParams, useSearchParams } from 'react-router-dom'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { Filetree } from './Filetree'
import { exampleProject } from './exampleProject'

/** Project workspace from the Concept 2 wireframes: header with graph toggle, element tree, content. */
export function WorkspaceLayout() {
  const { projectId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const graphView = searchParams.get('view') === 'graph'

  if (projectId !== exampleProject.id) return <NotFoundPage />

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <Link to="/projects" className="text-sm text-muted-foreground hover:underline">
          Projects
        </Link>
        <span className="font-medium">{exampleProject.name}</span>
        <Link to={`/projects/${projectId}/settings`} className="text-sm text-muted-foreground hover:underline">
          Settings
        </Link>
        <Link to="/design-system/colors" className="text-sm text-muted-foreground hover:underline">Colour schemes</Link>
        <div className="ml-auto flex items-center gap-2">
          <Switch
            id="graph-view"
            checked={graphView}
            onCheckedChange={(checked) => setSearchParams(checked ? { view: 'graph' } : {})}
          />
          <Label htmlFor="graph-view">Graph</Label>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Project elements" className="w-72 shrink-0 overflow-y-auto border-r bg-sidebar p-2 text-sidebar-foreground">
          <h2 className="mb-1 px-1.5 text-xs font-medium text-muted-foreground">Project elements</h2>
          <Filetree nodes={exampleProject.tree} projectId={projectId} />
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
