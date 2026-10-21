import { Menu, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AppHeader() {
  return (
    <header className="flex h-16 items-center gap-4 border-b px-4">
      <Button variant="ghost" size="icon" aria-label="Toggle sidebar">
        <Menu />
      </Button>
      <span className="text-xl font-semibold">TARAmisu</span>
      <UserCircle className="ml-auto text-muted-foreground" />
    </header>
  )
}
