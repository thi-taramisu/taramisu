import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'

export function AuthCallbackPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { completeCallback, signIn } = useAuth()
  const [failed, setFailed] = useState(false)
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return
    handledRef.current = true

    completeCallback(searchParams)
      .then((returnTo) => {
        navigate(returnTo, { replace: true })
      })
      .catch(() => setFailed(true))
  }, [completeCallback, navigate, searchParams])

  if (failed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-semibold">{t('ui:signInFailed')}</h1>
        <p role="alert" className="text-sm text-destructive">
          {t('ui:signInError')}
        </p>
        <div className="flex gap-3">
          <Button type="button" onClick={() => void signIn('/projects')}>
            {t('ui:tryAgain')}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/projects')}>
            {t('navigation.backToProjects')}
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-2 p-6">
      <h1 className="text-xl font-semibold">{t('ui:completingSignIn')}</h1>
      <p className="text-sm text-muted-foreground">
        {t('ui:authExchange')}
      </p>
    </main>
  )
}
