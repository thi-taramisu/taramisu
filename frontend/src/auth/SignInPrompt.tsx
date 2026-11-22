import { useTranslation } from 'react-i18next'
import { LogIn } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from './useAuth'

/** Shown instead of a load error when the backend answered 401; signing in returns to the current page. */
export function SignInPrompt({ children }: { children: string }) {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const { pathname } = useLocation()
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{children}</p>
      <Button variant="outline" size="sm" onClick={() => void signIn(pathname)}>
        <LogIn className="size-4" />
        {t('navigation.signIn')}
      </Button>
    </div>
  )
}
