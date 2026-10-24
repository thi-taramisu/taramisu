import * as Sentry from '@sentry/react'

export const sentryEnabled = Boolean(import.meta.env.VITE_SENTRY_DSN)

if (sentryEnabled) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
  })
}
