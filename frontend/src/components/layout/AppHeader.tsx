import { Menu, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type AppHeaderProps = {
  collapsed: boolean
  onToggleSidebar: () => void
}

export function AppHeader({ collapsed, onToggleSidebar }: AppHeaderProps) {
  return (
    <header className="flex h-16 items-center gap-4 border-b px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        aria-controls="main-sidebar"
        onClick={onToggleSidebar}
      >
        <Menu />
      </Button>
      <span className="text-xl font-semibold">TARAmisu</span>
      <UserCircle className="ml-auto text-muted-foreground" />
    </header>
  )
}
