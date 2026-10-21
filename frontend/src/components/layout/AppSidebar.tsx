
import { Archive, FolderOpen, Plus, Search } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/button'

type AppSidebarProps = {
  collapsed: boolean
}

export function AppSidebar({ collapsed }: AppSidebarProps) {
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
        <NavLink
          to="/projects"
          aria-label="Projects"
          title={collapsed ? 'Projects' : undefined}
          className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted"
        >
          <FolderOpen size={18} className="shrink-0" />
          {!collapsed && <span>Projects</span>}
        </NavLink>

        <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
          <Archive size={18} className="shrink-0" />
          {!collapsed && <span>Archive</span>}
        </div>
      </nav>

      <div className="mt-auto pt-4">
        <Button
          variant="outline"
          className="w-full"
          disabled
          aria-label="Create Project"
          title="Create Project will be implemented later"
        >
          <Plus size={16} />
          {!collapsed && <span>Create Project</span>}
        </Button>
      </div>
    </aside>
  )
}
