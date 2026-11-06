import { createContext, useContext } from 'react'
import { buildAuthorizationUrl } from './oidc'

export interface AuthenticatedUser {
  id?: string
  sub: string
  name: string
  email: string
}

export interface SignOutOptions {
  localOnly?: boolean
  postLogoutRedirectUri?: string
}

export interface AuthContextValue {
  status: 'authenticated' | 'unauthenticated'
  user: AuthenticatedUser | null
  accessToken: string | null
  signIn: (returnTo?: string) => Promise<void>
  signOut: (options?: SignOutOptions) => Promise<void>
  completeCallback: (searchParams: URLSearchParams) => Promise<string>
}

export const defaultAuthContext: AuthContextValue = {
  status: 'unauthenticated',
  user: null,
  accessToken: null,
  async signIn(returnTo = '/projects') {
    const url = await buildAuthorizationUrl(returnTo)
    window.location.assign(url)
  },
  async signOut() {
    // No-op when rendered outside AuthProvider
  },
  async completeCallback() {
    return '/projects'
  },
}

export const AuthContext = createContext<AuthContextValue>(defaultAuthContext)

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

