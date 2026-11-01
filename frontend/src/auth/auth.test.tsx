import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/AppHeader'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { AuthProvider } from './AuthContext'
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  generateCodeChallenge,
  getOidcConfig,
  parseJwtClaims,
  refreshAccessToken,
  type OidcConfig,
} from './oidc'
import { useAuth } from './useAuth'

function StatusProbe() {
  const { status } = useAuth()
  return <span>Status: {status}</span>
}

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())

const testOidcConfig: OidcConfig = {
  authority: 'http://auth.test/auth/application/o/taramisu',
  clientId: 'taramisu',
  redirectUri: 'http://localhost/auth/callback',
  postLogoutRedirectUri: 'http://localhost/projects',
  authorizeEndpoint: 'http://auth.test/auth/application/o/authorize/',
  tokenEndpoint: 'http://auth.test/auth/application/o/token/',
  endSessionEndpoint: 'http://auth.test/auth/application/o/taramisu/end-session/',
  revocationEndpoint: 'http://auth.test/auth/application/o/revoke/',
  scopes: 'openid profile email offline_access',
}

function makeFakeJwt(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify(claims))
  return `${header}.${payload}.sig`
}

describe('OIDC + PKCE helpers', () => {
  it('derives default endpoints under /auth/', () => {
    const cfg = getOidcConfig()
    expect(cfg.clientId).toBe('taramisu')
    expect(cfg.authorizeEndpoint).toBe('/auth/application/o/authorize/')
    expect(cfg.tokenEndpoint).toBe('/auth/application/o/token/')
  })

  it('builds a PKCE S256 authorization URL and exchanges the authorization code', async () => {
    const authUrlString = await buildAuthorizationUrl('/projects/headlamp', testOidcConfig)
    const authUrl = new URL(authUrlString)

    expect(authUrl.origin + authUrl.pathname).toBe(testOidcConfig.authorizeEndpoint)
    expect(authUrl.searchParams.get('client_id')).toBe('taramisu')
    expect(authUrl.searchParams.get('response_type')).toBe('code')
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256')
    const state = authUrl.searchParams.get('state')!
    const challenge = authUrl.searchParams.get('code_challenge')!
    expect(state.length).toBeGreaterThan(10)
    expect(challenge.length).toBeGreaterThan(20)

    let receivedVerifier = ''
    server.use(
      http.post(testOidcConfig.tokenEndpoint, async ({ request }) => {
        const form = new URLSearchParams(await request.text())
        receivedVerifier = form.get('code_verifier') ?? ''
        return HttpResponse.json({
          access_token: makeFakeJwt({
            sub: 'user-uuid-1',
            name: 'Ada Lovelace',
            email: 'ada@example.org',
          }),
          refresh_token: 'refresh-1',
          expires_in: 600,
        })
      }),
    )

    const callbackParams = new URLSearchParams({ code: 'auth-code-123', state })
    const { tokens, returnTo } = await exchangeAuthorizationCode(callbackParams, testOidcConfig)

    expect(returnTo).toBe('/projects/headlamp')
    expect(tokens.refreshToken).toBe('refresh-1')
    expect(await generateCodeChallenge(receivedVerifier)).toBe(challenge)
    expect(sessionStorage.getItem('taramisu.oidc.pkce')).toBeNull()
  })

  it('rejects OAuth error responses and state mismatches', async () => {
    await expect(
      exchangeAuthorizationCode(
        new URLSearchParams({ error: 'access_denied', error_description: 'User cancelled' }),
        testOidcConfig,
      ),
    ).rejects.toThrow('access_denied: User cancelled')

    await expect(
      exchangeAuthorizationCode(new URLSearchParams({ code: 'x' }), testOidcConfig),
    ).rejects.toThrow('Missing authorization code or state parameter')

    await buildAuthorizationUrl('/projects', testOidcConfig)
    await expect(
      exchangeAuthorizationCode(
        new URLSearchParams({ code: 'x', state: 'wrong-state' }),
        testOidcConfig,
      ),
    ).rejects.toThrow('Invalid OAuth state parameter')
  })

  it('refreshes access tokens and parses JWT claims', async () => {
    server.use(
      http.post(testOidcConfig.tokenEndpoint, () =>
        HttpResponse.json({
          access_token: makeFakeJwt({
            sub: 'user-uuid-2',
            name: 'Grace Hopper',
            email: 'grace@example.org',
            exp: 1900000000,
          }),
          expires_in: 600,
        }),
      ),
    )

    const refreshed = await refreshAccessToken('refresh-old', testOidcConfig)
    expect(refreshed.refreshToken).toBe('refresh-old')

    const claims = parseJwtClaims(refreshed.accessToken)
    expect(claims).toEqual({
      sub: 'user-uuid-2',
      name: 'Grace Hopper',
      email: 'grace@example.org',
      exp: 1900000000,
    })
    expect(parseJwtClaims('not-a-jwt')).toBeNull()
  })
})

describe('AuthProvider, AppHeader, and AuthCallbackPage', () => {
  it('completes OIDC callback, hydrates /me, persists across page refresh, and supports Sign out', async () => {
    const user = userEvent.setup()
    const authUrl = new URL(await buildAuthorizationUrl('/projects', testOidcConfig))
    const state = authUrl.searchParams.get('state')!
    const jwt = makeFakeJwt({
      sub: 'sub-123',
      name: 'Dev User',
      email: 'dev@taramisu.local',
    })

    let revokedToken = ''
    server.use(
      http.post(testOidcConfig.tokenEndpoint, () =>
        HttpResponse.json({
          access_token: jwt,
          refresh_token: 'rt-123',
          expires_in: 600,
        }),
      ),
      http.post(testOidcConfig.revocationEndpoint, async ({ request }) => {
        const form = new URLSearchParams(await request.text())
        revokedToken = form.get('token') ?? ''
        return HttpResponse.json({})
      }),
      http.get('http://api.test/api/v1/me', ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${jwt}`)
        return HttpResponse.json({
          id: '11111111-1111-1111-1111-111111111111',
          issuer: testOidcConfig.authority,
          subject: 'sub-123',
          name: 'Dev User',
          email: 'dev@taramisu.local',
        })
      }),
    )

    const navigateExternal = vi.fn<(url: string) => void>()

    const { unmount } = render(
      <MemoryRouter initialEntries={[`/auth/callback?code=ok-code&state=${state}`]}>
        <AuthProvider
          config={testOidcConfig}
          apiBaseUrl="http://api.test"
          onNavigateExternal={navigateExternal}
        >
          <Routes>
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route
              path="/projects"
              element={<AppHeader collapsed={false} onToggleSidebar={() => {}} />}
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Dev User')).toBeInTheDocument()
    })

    // Simulate full browser page refresh (remounting the React tree from scratch)
    unmount()
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <AuthProvider
          config={testOidcConfig}
          apiBaseUrl="http://api.test"
          onNavigateExternal={navigateExternal}
        >
          <AppHeader collapsed={false} onToggleSidebar={() => {}} />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Dev User')).toBeInTheDocument()

    const signOutBtn = screen.getByRole('button', { name: /sign out/i })
    await user.click(signOutBtn)

    expect(revokedToken).toBe('rt-123')
    expect(navigateExternal).toHaveBeenCalledWith(
      expect.stringContaining(testOidcConfig.endSessionEndpoint),
    )
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(sessionStorage.getItem('taramisu.oidc.session')).toBeNull()
  })

  it('initiates PKCE redirect when Sign in is clicked and displays callback errors', async () => {
    const user = userEvent.setup()
    const navigateExternal = vi.fn<(url: string) => void>()

    render(
      <MemoryRouter initialEntries={['/auth/callback?error=invalid_request']}>
        <AuthProvider
          config={testOidcConfig}
          apiBaseUrl="http://api.test"
          onNavigateExternal={navigateExternal}
        >
          <StatusProbe />
          <Routes>
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Sign-in failed' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('invalid_request')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => {
      expect(navigateExternal).toHaveBeenCalledOnce()
    })
    expect(navigateExternal.mock.calls[0]?.[0]).toContain(testOidcConfig.authorizeEndpoint)
  })
})
