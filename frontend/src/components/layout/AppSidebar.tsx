
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
  return (
    <aside
      id="main-sidebar"
      aria-label="Sidebar"
      className={`flex shrink-0 flex-col border-r p-3 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <SearchTrigger compact={collapsed} className="mb-4 w-full" />

      <nav aria-label="Main navigation" className="space-y-2">
        <Button
          type="button"
          variant={activeView === 'projects' ? 'secondary' : 'ghost'}
          className="w-full justify-start gap-2"
          onClick={onShowProjects}
          aria-label="Projects"
          aria-pressed={activeView === 'projects'}
          title={collapsed ? 'Projects' : undefined}
        >
          <FolderOpen size={18} className="shrink-0" />
          {!collapsed && <span>Projects</span>}
        </Button>

        <Button
          type="button"
          variant={activeView === 'archive' ? 'secondary' : 'ghost'}
          className="w-full justify-start gap-2"
          onClick={onShowArchive}
          aria-label="Archive"
          aria-pressed={activeView === 'archive'}
          title={collapsed ? 'Archive' : undefined}
        >
          <Archive size={18} className="shrink-0" />
          {!collapsed && <span>Archive</span>}
        </Button>
      </nav>

      <div className="mt-auto pt-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={(event) => onCreateProject(event.currentTarget)}
          aria-label="Create Project"
          title={collapsed ? 'Create Project' : undefined}
        >
          <Plus size={16} />
          {!collapsed && <span>Create Project</span>}
        </Button>
      </div>
    </aside>
  )
}
