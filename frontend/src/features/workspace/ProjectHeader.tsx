import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router-dom'
import { LanguageSelector } from '@/components/layout/LanguageSelector'
import { exampleProject } from '../../api/mocks/data/headlamp'
import { SearchTrigger } from '../search/SearchTrigger'
import { ThemeToggle } from '../theme/ThemeToggle'

/** Top bar of a project (workspace and settings); page-specific controls go into `children` on the right. */
export function ProjectHeader({ projectId, projectName = exampleProject.name, children }: { projectId: string; projectName?: string; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
      <Link to="/projects" className="text-sm text-muted-foreground hover:underline">
        {t('navigation.projects')}
      </Link>
      <span className="font-medium">{projectName}</span>
      {projectId === exampleProject.id && (
        <NavLink
          to={`/projects/${projectId}/settings`}
          className={({ isActive }) => `text-sm hover:underline ${isActive ? 'font-medium' : 'text-muted-foreground'}`}
        >
          {t('navigation.settings')}
        </NavLink>
      )}
      <Link to="/design-system/colors" className="text-sm text-muted-foreground hover:underline">{t('navigation.colourSchemes')}</Link>
      <div className="ml-auto flex items-center gap-2">
        <SearchTrigger compact />
        <LanguageSelector />
        <ThemeToggle />
        {children}
      </div>
    </header>
  )
}
