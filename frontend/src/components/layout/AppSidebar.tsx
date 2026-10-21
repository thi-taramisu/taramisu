
import { Archive, FolderOpen, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

type AppSidebarProps = {
  collapsed: boolean
  activeView: 'projects' | 'archive'
  onShowProjects: () => void
  onShowArchive: () => void
  onCreateProject: () => void
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
      {collapsed ? (
        <div className="mb-4 flex justify-center p-2" title="Search">
          <Search size={18} />
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
          <Search size={16} />
          <span>Search</span>
        </div>
      )}

      <nav aria-label="Main navigation" className="space-y-2">
        <Button
          type="button"
          variant={activeView === 'projects' ? 'secondary' : 'ghost'}
          className="w-full justify-start gap-2"
          onClick={onShowProjects}
          aria-label="Projects"
          aria-current={activeView === 'projects' ? 'page' : undefined}
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
          aria-current={activeView === 'archive' ? 'page' : undefined}
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
          onClick={onCreateProject}
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
