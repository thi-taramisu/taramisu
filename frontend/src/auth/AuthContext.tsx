import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createApiClient } from '@/api/client'
import {
  buildAuthorizationUrl,
  buildEndSessionUrl,
  clearStoredSession,
  exchangeAuthorizationCode,
  getOidcConfig,
  loadStoredSession,
  parseJwtClaims,
  refreshAccessToken,
  revokeToken,
  saveStoredSession,
  type OidcConfig,
  type StoredSession,
  type TokenSet,
} from './oidc'
import {
  AuthContext,
  type AuthContextValue,
  type AuthenticatedUser,
  type SignOutOptions,
} from './useAuth'

export interface AuthProviderProps {
  children: ReactNode
  initialTokens?: TokenSet | null
  config?: OidcConfig
  apiBaseUrl?: string
  fetchImpl?: typeof fetch
  onNavigateExternal?: (url: string) => void
}

function defaultNavigateExternal(url: string) {
  window.location.assign(url)
}

function deriveUserFromTokens(
  tokens: TokenSet | null,
  userId?: string,
): AuthenticatedUser | null {
  if (!tokens) return null
  const claims = parseJwtClaims(tokens.accessToken)
  if (!claims) {
    return { id: userId, sub: 'authenticated', name: 'Authenticated User', email: '' }
  }
  return {
    id: userId,
    sub: claims.sub,
    name: claims.name,
    email: claims.email,
  }
}

export function AuthProvider({
  children,
  initialTokens,
  config,
  apiBaseUrl,
  fetchImpl = fetch,
  onNavigateExternal = defaultNavigateExternal,
}: AuthProviderProps) {
  const oidcConfig = useMemo(() => config ?? getOidcConfig(), [config])
  const sessionGenerationRef = useRef(0)
  const initialSession = useMemo<StoredSession | null>(() => {
    if (initialTokens !== undefined) {
      return initialTokens ? { tokens: initialTokens } : null
    }
    return loadStoredSession()
  }, [initialTokens])
  const [tokens, setTokens] = useState<TokenSet | null>(() => initialSession?.tokens ?? null)
  const [user, setUser] = useState<AuthenticatedUser | null>(() =>
    deriveUserFromTokens(initialSession?.tokens ?? null, initialSession?.userId),
  )

  const signOut = useCallback(
    async (options?: SignOutOptions) => {
      sessionGenerationRef.current += 1
      const currentTokens = tokens

      clearStoredSession()
      setTokens(null)
      setUser(null)

      if (currentTokens?.refreshToken) {
        try {
          await Promise.race([
            revokeToken(currentTokens.refreshToken, oidcConfig, fetchImpl),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
          ])
        } catch {
          // Best-effort remote revocation: network errors or timeouts must not prevent sign-out or redirect.
        }
      }

      if (!options?.localOnly) {
        const url = buildEndSessionUrl(
          oidcConfig,
          currentTokens?.idToken,
          options?.postLogoutRedirectUri,
        )
        onNavigateExternal(url)
      }
    },
    [fetchImpl, oidcConfig, onNavigateExternal, tokens],
  )

  const accessToken = tokens?.accessToken ?? null

  const signIn = useCallback(
    async (returnTo = '/projects') => {
      const url = await buildAuthorizationUrl(returnTo, oidcConfig)
      onNavigateExternal(url)
    },
    [oidcConfig, onNavigateExternal],
  )

  const completeCallback = useCallback(
    async (searchParams: URLSearchParams): Promise<string> => {
      sessionGenerationRef.current += 1
      const generation = sessionGenerationRef.current
      const { tokens: exchanged, returnTo } = await exchangeAuthorizationCode(
        searchParams,
        oidcConfig,
        fetchImpl,
      )
      if (sessionGenerationRef.current !== generation) {
        return returnTo
      }
      setTokens(exchanged)
      const initialUser = deriveUserFromTokens(exchanged)
      saveStoredSession(exchanged)
      setUser(initialUser)

      const callbackClient = createApiClient({
        baseUrl: apiBaseUrl,
        getToken: () => exchanged.accessToken,
        onUnauthorized: () => {
          void signOut({ localOnly: true })
        },
      })

      try {
        const { data } = await callbackClient.GET('/api/v1/me')
        if (data && sessionGenerationRef.current === generation) {
          saveStoredSession(exchanged, data.id)
          setUser({
            id: data.id,
            sub: data.subject,
            name: data.name || initialUser?.name || data.subject,
            email: data.email || initialUser?.email || '',
          })
        }
      } catch {
        // Keep claims parsed from the JWT if /api/v1/me is temporarily unreachable
      }

      return returnTo
    },
    [apiBaseUrl, fetchImpl, oidcConfig, signOut],
  )

  useEffect(() => {
    if (!tokens?.refreshToken) return undefined

    const currentGeneration = sessionGenerationRef.current
    const refreshLeadMs = 60_000
    const delayMs = Math.max(0, tokens.expiresAt - Date.now() - refreshLeadMs)
    let cancelled = false

    const timer = window.setTimeout(async () => {
      try {
        const next = await refreshAccessToken(tokens.refreshToken!, oidcConfig, fetchImpl)
        if (cancelled || sessionGenerationRef.current !== currentGeneration) {
          return
        }
        setTokens(next)
        setUser((prev) => {
          if (cancelled || sessionGenerationRef.current !== currentGeneration) {
            return null
          }
          const derived = deriveUserFromTokens(next, prev?.id)
          saveStoredSession(next, prev?.id)
          return derived ?? prev
        })
      } catch {
        if (!cancelled && sessionGenerationRef.current === currentGeneration) {
          void signOut({ localOnly: true })
        }
      }
    }, delayMs)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [fetchImpl, oidcConfig, signOut, tokens])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: tokens ? 'authenticated' : 'unauthenticated',
      user,
      accessToken,
      signIn,
      signOut,
      completeCallback,
    }),
    [accessToken, completeCallback, signIn, signOut, tokens, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
