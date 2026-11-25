import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { exampleProject } from '../api/mocks/data/headlamp'
import { isNotFound } from '../api/errors'
import { useProject } from '../api/queries/projects'
import { ArchivedProjectBanner } from '../features/projects/ArchivedProjectBanner'
import { ProjectHeader } from '../features/workspace/ProjectHeader'
import { NotFoundPage } from './NotFoundPage'
import { useTranslation } from 'react-i18next'

const SECTIONS = [
  { path: '', label: 'navigation.general' },
  { path: 'members', label: 'navigation.members' },
]

/** Project settings with "General" and "Members" sections as child routes. */
export function ProjectSettingsPage() {
  const { t } = useTranslation()
  const { projectId = '' } = useParams()
  const project = useProject(projectId)
  // Settings data exists only for the example project; a deleted project has no settings.
  if (projectId !== exampleProject.id || isNotFound(project.error)) return <NotFoundPage />

  return (
    <div className="flex h-screen flex-col">
      <ProjectHeader projectId={projectId} />
      <ArchivedProjectBanner projectId={projectId} />
      <div className="flex min-h-0 flex-1">
        <nav aria-label={t('navigation.settings')} className="w-56 shrink-0 space-y-1 border-r p-3">
          <Link to={`/projects/${projectId}`} className="mb-3 block text-sm text-muted-foreground hover:underline">
            ← {t('navigation.back')}
          </Link>
          <h2 className="mb-1 px-2 text-xs font-medium text-muted-foreground">{t('navigation.settings')}</h2>
          {SECTIONS.map((s) => (
            <NavLink
              key={s.path}
              to={s.path}
              end
              className={({ isActive }) =>
                `block rounded-md px-2 py-1 text-sm hover:bg-muted ${isActive ? 'bg-muted font-medium' : ''}`
              }
            >
              {t(s.label)}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
