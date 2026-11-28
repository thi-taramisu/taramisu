import { useTranslation } from 'react-i18next'
import { Archive, FolderOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchTrigger } from '@/features/search/SearchTrigger'

type AppSidebarProps = {
  collapsed: boolean
  activeView: 'projects' | 'archive'
  onShowProjects: () => void
  onShowArchive: () => void
  onCreateProject: (opener: HTMLButtonElement) => void
}

export function AppSidebar({
  collapsed,
  activeView,
  onShowProjects,
  onShowArchive,
  onCreateProject,
}: AppSidebarProps) {
  const { t } = useTranslation()
  return (
    <aside
      id="main-sidebar"
      aria-label={t('navigation.sidebar')}
      className={`flex shrink-0 flex-col border-r p-3 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <SearchTrigger compact={collapsed} className="mb-4 w-full" />

      <nav aria-label={t('navigation.mainNavigation')} className="space-y-2">
        <Button
          type="button"
          variant={activeView === 'projects' ? 'secondary' : 'ghost'}
          className="w-full justify-start gap-2"
          onClick={onShowProjects}
          aria-label={t('navigation.projects')}
          aria-pressed={activeView === 'projects'}
          title={collapsed ? t('navigation.projects') : undefined}
        >
          <FolderOpen size={18} className="shrink-0" />
          {!collapsed && <span>{t('navigation.projects')}</span>}
        </Button>

        <Button
          type="button"
          variant={activeView === 'archive' ? 'secondary' : 'ghost'}
          className="w-full justify-start gap-2"
          onClick={onShowArchive}
          aria-label={t('navigation.archive')}
          aria-pressed={activeView === 'archive'}
          title={collapsed ? t('navigation.archive') : undefined}
        >
          <Archive size={18} className="shrink-0" />
          {!collapsed && <span>{t('navigation.archive')}</span>}
        </Button>
      </nav>

      <div className="mt-auto pt-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={(event) => onCreateProject(event.currentTarget)}
          aria-label={t('navigation.createProject')}
          title={collapsed ? t('navigation.createProject') : undefined}
        >
          <Plus size={16} />
          {!collapsed && <span>{t('navigation.createProject')}</span>}
        </Button>
      </div>
    </aside>
  )
}
