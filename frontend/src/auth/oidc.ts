export interface OidcConfig {
  authority: string
  clientId: string
  redirectUri: string
  postLogoutRedirectUri?: string
  authorizeEndpoint: string
  tokenEndpoint: string
  endSessionEndpoint: string
  revocationEndpoint: string
  scopes: string
}

export interface TokenSet {
  accessToken: string
  refreshToken: string | null
  idToken: string | null
  expiresAt: number
}

export interface JwtClaims {
  sub: string
  name: string
  email: string
  exp?: number
}

interface PkceHandshakeState {
  state: string
  codeVerifier: string
  returnTo: string
}

const PKCE_STORAGE_KEY = 'taramisu.oidc.pkce'
const SESSION_STORAGE_KEY = 'taramisu.oidc.session'

export interface StoredSession {
  tokens: TokenSet
  userId?: string
}

export function loadStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    const tokens = parsed.tokens
    if (
      !tokens ||
      typeof tokens.accessToken !== 'string' ||
      !tokens.accessToken ||
      typeof tokens.expiresAt !== 'number'
    ) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    if (tokens.expiresAt <= Date.now() && !tokens.refreshToken) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return {
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: typeof tokens.refreshToken === 'string' ? tokens.refreshToken : null,
        idToken: typeof tokens.idToken === 'string' ? tokens.idToken : null,
        expiresAt: tokens.expiresAt,
      },
      userId: typeof parsed.userId === 'string' ? parsed.userId : undefined,
    }
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export function saveStoredSession(tokens: TokenSet, userId?: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ tokens, userId }))
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
}

export function getOidcConfig(): OidcConfig {
  const authority = (import.meta.env.VITE_OIDC_AUTHORITY ?? '/auth/application/o/taramisu').replace(
    /\/+$/,
    '',
  )
  const providerRoot = authority.replace(/\/application\/o\/[^/]+$/, '/application/o')
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  return {
    authority,
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID ?? 'taramisu',
    redirectUri: import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${origin}/auth/callback`,
    postLogoutRedirectUri: import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? `${origin}/projects`,
    authorizeEndpoint: `${providerRoot}/authorize/`,
    tokenEndpoint: `${providerRoot}/token/`,
    endSessionEndpoint: `${authority}/end-session/`,
    revocationEndpoint: `${providerRoot}/revoke/`,
    scopes: 'openid profile email offline_access',
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (padded.length % 4)) % 4
  const binary = atob(padded + '='.repeat(padLength))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

export function generateRandomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toBase64Url(new Uint8Array(digest))
}

export async function buildAuthorizationUrl(
  returnTo = '/projects',
  config: OidcConfig = getOidcConfig(),
): Promise<string> {
  const state = generateRandomString(24)
  const codeVerifier = generateRandomString(32)
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  const safeReturnTo =
    returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/projects'

  const handshake: PkceHandshakeState = {
    state,
    codeVerifier,
    returnTo: safeReturnTo,
  }
  sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(handshake))

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const url = new URL(config.authorizeEndpoint, origin)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', config.scopes)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export function buildEndSessionUrl(
  config: OidcConfig = getOidcConfig(),
  idToken?: string | null,
  postLogoutRedirectUri?: string,
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const url = new URL(config.endSessionEndpoint, origin)
  url.searchParams.set('client_id', config.clientId)
  const target = postLogoutRedirectUri ?? config.postLogoutRedirectUri
  if (target) {
    url.searchParams.set('post_logout_redirect_uri', target)
  }
  if (idToken) {
    url.searchParams.set('id_token_hint', idToken)
  }
  return url.toString()
}

export async function revokeToken(
  token: string,
  config: OidcConfig = getOidcConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    const body = new URLSearchParams({
      client_id: config.clientId,
      token,
    })
    await fetchImpl(config.revocationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch {
    // Revocation failure should not prevent local session termination
  }
}

interface TokenEndpointResponse {
  access_token?: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

function parseTokenResponse(payload: TokenEndpointResponse): TokenSet {
  if (!payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? 'Missing access_token in response')
  }
  const expiresInSeconds = typeof payload.expires_in === 'number' && payload.expires_in > 0
    ? payload.expires_in
    : 600
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    idToken: payload.id_token ?? null,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  }
}

export async function exchangeAuthorizationCode(
  searchParams: URLSearchParams,
  config: OidcConfig = getOidcConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<{ tokens: TokenSet; returnTo: string }> {
  const oauthError = searchParams.get('error')
  if (oauthError) {
    sessionStorage.removeItem(PKCE_STORAGE_KEY)
    const description = searchParams.get('error_description')
    throw new Error(description ? `${oauthError}: ${description}` : oauthError)
  }

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (!code || !state) {
    sessionStorage.removeItem(PKCE_STORAGE_KEY)
    throw new Error('Missing authorization code or state parameter')
  }

  const rawHandshake = sessionStorage.getItem(PKCE_STORAGE_KEY)
  sessionStorage.removeItem(PKCE_STORAGE_KEY)
  if (!rawHandshake) {
    throw new Error('Missing PKCE session state; please sign in again')
  }

  let handshake: PkceHandshakeState
  try {
    handshake = JSON.parse(rawHandshake) as PkceHandshakeState
  } catch {
    throw new Error('Corrupted PKCE session state')
  }

  if (handshake.state !== state || !handshake.codeVerifier) {
    throw new Error('Invalid OAuth state parameter')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: handshake.codeVerifier,
  })

  const response = await fetchImpl(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const payload = (await response.json()) as TokenEndpointResponse
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Token exchange failed')
  }

  const safeReturnTo =
    handshake.returnTo?.startsWith('/') && !handshake.returnTo?.startsWith('//')
      ? handshake.returnTo
      : '/projects'

  return {
    tokens: parseTokenResponse(payload),
    returnTo: safeReturnTo,
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  config: OidcConfig = getOidcConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  })

  const response = await fetchImpl(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const payload = (await response.json()) as TokenEndpointResponse
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Token refresh failed')
  }

  const nextTokens = parseTokenResponse(payload)
  return {
    ...nextTokens,
    refreshToken: nextTokens.refreshToken ?? refreshToken,
  }
}

export function parseJwtClaims(token: string): JwtClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) {
    return null
  }
  try {
    const decoded = JSON.parse(fromBase64Url(parts[1])) as Record<string, unknown>
    if (typeof decoded.sub !== 'string' || !decoded.sub) {
      return null
    }
    return {
      sub: decoded.sub,
      name: typeof decoded.name === 'string' ? decoded.name : decoded.sub,
      email: typeof decoded.email === 'string' ? decoded.email : '',
      exp: typeof decoded.exp === 'number' ? decoded.exp : undefined,
    }
  } catch {
    return null
  }
}

