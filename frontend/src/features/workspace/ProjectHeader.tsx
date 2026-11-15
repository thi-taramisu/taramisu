import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { exampleProject } from '../../api/mocks/data/headlamp'
import { LanguageSelector } from '@/components/layout/LanguageSelector'
import { useTranslation } from 'react-i18next'

/** Top bar of a project (workspace and settings); page-specific controls go into `children` on the right. */
export function ProjectHeader({ projectId, children }: { projectId: string; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
      <Link to="/projects" className="text-sm text-muted-foreground hover:underline">
        {t('navigation.projects')}
      </Link>
      <span className="font-medium">{exampleProject.name}</span>
      <NavLink
        to={`/projects/${projectId}/settings`}
        className={({ isActive }) => `text-sm hover:underline ${isActive ? 'font-medium' : 'text-muted-foreground'}`}
      >
        {t('navigation.settings')}
      </NavLink>
      <Link to="/design-system/colors" className="text-sm text-muted-foreground hover:underline">{t('navigation.colourSchemes')}</Link>
      <div className="ml-auto flex items-center gap-2">
        {children}
        <LanguageSelector />
      </div>
    </header>
  )
}
