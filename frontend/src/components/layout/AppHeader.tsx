import { LogIn, LogOut, Menu, UserCircle } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { LanguageSelector } from './LanguageSelector'

type AppHeaderProps = {
  collapsed: boolean
  onToggleSidebar: () => void
}

export function AppHeader({ collapsed, onToggleSidebar }: AppHeaderProps) {
  const { status, user, signIn, signOut } = useAuth()

  return (
    <header className="flex min-h-16 flex-wrap items-center gap-2 border-b px-4 py-2 sm:gap-4">
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
      <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-3">
        <LanguageSelector />
        {status === 'authenticated' && user ? (
          <>
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground" title={user.email}>
              <UserCircle className="size-4 shrink-0" />
              <span className="truncate">{user.name}</span>
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => void signIn()}>
            <LogIn className="size-4" />
            Sign in
          </Button>
        )}
      </div>
    </header>
  )
}
