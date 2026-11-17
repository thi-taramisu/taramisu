import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { exampleProject } from '../../api/mocks/data/headlamp'
import { SearchTrigger } from '../search/SearchTrigger'

/** Top bar of a project (workspace and settings); page-specific controls go into `children` on the right. */
export function ProjectHeader({ projectId, projectName = exampleProject.name, children }: { projectId: string; projectName?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
      <Link to="/projects" className="text-sm text-muted-foreground hover:underline">
        Projects
      </Link>
      <span className="font-medium">{projectName}</span>
      {projectId === exampleProject.id && (
        <NavLink
          to={`/projects/${projectId}/settings`}
          className={({ isActive }) => `text-sm hover:underline ${isActive ? 'font-medium' : 'text-muted-foreground'}`}
        >
          Settings
        </NavLink>
      )}
      <Link to="/design-system/colors" className="text-sm text-muted-foreground hover:underline">Colour schemes</Link>
      <div className="ml-auto flex items-center gap-2"><SearchTrigger compact />{children}</div>
    </header>
  )
}
