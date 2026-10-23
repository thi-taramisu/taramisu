import * as Sentry from '@sentry/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/react', () => ({ init: vi.fn<typeof Sentry.init>() }))

describe('Sentry configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('VITE_SENTRY_DSN', '')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', undefined)
    vi.stubEnv('VITE_SENTRY_RELEASE', undefined)
  })

  afterEach(() => vi.unstubAllEnvs())

  it('does not initialize or send events without a DSN', async () => {
    const { sentryEnabled } = await import('./sentry')

    expect(sentryEnabled).toBe(false)
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('uses the configured DSN, environment, and release', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.com/1')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'staging')
    vi.stubEnv('VITE_SENTRY_RELEASE', 'taramisu@1.0.0')

    const { sentryEnabled } = await import('./sentry')

    expect(sentryEnabled).toBe(true)
    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith({
      dsn: 'https://public@example.com/1',
      environment: 'staging',
      release: 'taramisu@1.0.0',
    })
  })

  it('defaults to the Vite mode and leaves the release unset', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.com/1')
    vi.stubEnv('MODE', 'test')
    vi.stubEnv('VITE_SENTRY_RELEASE', '')

    await import('./sentry')

    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith({
      dsn: 'https://public@example.com/1',
      environment: 'test',
      release: undefined,
    })
  })
})
