import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { completeCallback, signIn } = useAuth()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return
    handledRef.current = true

    completeCallback(searchParams)
      .then((returnTo) => {
        navigate(returnTo, { replace: true })
      })
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : 'Authentication failed')
      })
  }, [completeCallback, navigate, searchParams])

  if (errorMessage) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-semibold">Sign-in failed</h1>
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
        <div className="flex gap-3">
          <Button type="button" onClick={() => void signIn('/projects')}>
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/projects')}>
            Back to projects
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-2 p-6">
      <h1 className="text-xl font-semibold">Completing sign-in…</h1>
      <p className="text-sm text-muted-foreground">
        Exchanging authorization code with Authentik.
      </p>
    </main>
  )
}
