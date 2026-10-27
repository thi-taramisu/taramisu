import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { exampleProject } from '../features/workspace/exampleProject'
import { NotFoundPage } from './NotFoundPage'

const SECTIONS = [
  { path: '', label: 'General' },
  { path: 'members', label: 'Members' },
]

/** Project settings with "General" and "Members" sections as child routes. */
export function ProjectSettingsPage() {
  const { projectId } = useParams()
  if (projectId !== exampleProject.id) return <NotFoundPage />

  return (
    <div className="flex h-screen">
      <nav aria-label="Settings" className="w-56 shrink-0 space-y-1 border-r p-3">
        <Link to={`/projects/${projectId}`} className="mb-3 block text-sm text-muted-foreground hover:underline">
          ← Back
        </Link>
        {SECTIONS.map((s) => (
          <NavLink
            key={s.path}
            to={s.path}
            end
            className={({ isActive }) =>
              `block rounded-md px-2 py-1 text-sm hover:bg-muted ${isActive ? 'bg-muted font-medium' : ''}`
            }
          >
            {s.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 space-y-4 p-6">
        <h1 className="text-xl font-semibold">Settings: {exampleProject.name}</h1>
        <Outlet />
      </main>
    </div>
  )
}
