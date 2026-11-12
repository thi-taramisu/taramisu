import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setTheme, useTheme } from './theme'

/** The text and pressed state indicate the current mode, independently of color. */
export function ThemeToggle() {
  const theme = useTheme()
  const dark = theme === 'dark'
  const Icon = dark ? Moon : Sun
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label="Dark mode"
      aria-pressed={dark}
      title={`Switch to ${dark ? 'light' : 'dark'} mode`}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <Icon aria-hidden="true" className="size-4" />
      {dark ? 'Dark' : 'Light'}
    </Button>
  )
}
