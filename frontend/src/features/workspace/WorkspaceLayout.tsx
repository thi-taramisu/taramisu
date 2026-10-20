import { Link, NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { entityPath } from './entities'
import { exampleProject, type TreeNode } from './exampleProject'

function TreeLinks({ nodes, search }: { nodes: TreeNode[]; search: string }) {
  return (
    <ul className="space-y-1 pl-3 first:pl-0">
      {nodes.map((node) => (
        <li key={`${node.type}/${node.id}`}>
          <NavLink
            to={{ pathname: entityPath(exampleProject.id, node.type, node.id), search }}
            className={({ isActive }) =>
              `block truncate rounded-md px-2 py-1 text-sm hover:bg-muted ${isActive ? 'bg-muted font-medium' : ''}`
            }
          >
            <span className="text-xs text-muted-foreground">{node.code}</span> {node.name}
          </NavLink>
          {node.children && <TreeLinks nodes={node.children} search={search} />}
        </li>
      ))}
    </ul>
  )
}

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
        <nav aria-label="Project elements" className="w-72 shrink-0 overflow-y-auto border-r p-3">
          <TreeLinks nodes={exampleProject.tree} search={graphView ? '?view=graph' : ''} />
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
