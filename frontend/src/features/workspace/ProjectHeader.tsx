import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { exampleProject } from '../../api/mocks/data/headlamp'

/** Top bar of a project (workspace and settings); page-specific controls go into `children` on the right. */
export function ProjectHeader({ projectId, children }: { projectId: string; children?: ReactNode }) {
  return (
    <header className="flex items-center gap-4 border-b px-4 py-2">
      <Link to="/projects" className="text-sm text-muted-foreground hover:underline">
        Projects
      </Link>
      <span className="font-medium">{exampleProject.name}</span>
      <NavLink
        to={`/projects/${projectId}/settings`}
        className={({ isActive }) => `text-sm hover:underline ${isActive ? 'font-medium' : 'text-muted-foreground'}`}
      >
        Settings
      </NavLink>
      <Link to="/design-system/colors" className="text-sm text-muted-foreground hover:underline">Colour schemes</Link>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </header>
  )
}
