import { Archive, FolderOpen, Plus, Search } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function AppSidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r p-3" aria-label="Sidebar">
      <div className="mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
        <Search size={16} />
        <span>Search</span>
      </div>

      <nav aria-label="Main navigation" className="space-y-2">
        <NavLink to="/projects" className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted">
          <FolderOpen size={18} />
          Projects
        </NavLink>
        <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
          <Archive size={18} />
          Archive
        </div>
      </nav>

      <div className="mt-auto pt-4">
        <Button variant="outline" className="w-full" disabled>
          <Plus size={16} />
          Create Project
        </Button>
      </div>
    </aside>
  )
}
