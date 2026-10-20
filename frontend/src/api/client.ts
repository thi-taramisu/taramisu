import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'

export interface ApiClientOptions {
  baseUrl?: string
  /** Returns the current access token, or null when signed out. Wired to the IAM solution (#46) later. */
  getToken?: () => string | null | undefined
  /** Called on every 401 response, e.g. to redirect to login. */
  onUnauthorized?: () => void
}

export function createApiClient({
  baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  getToken,
  onUnauthorized,
}: ApiClientOptions = {}) {
  const client = createClient<paths>({ baseUrl })

  const middleware: Middleware = {
    onRequest({ request }) {
      const token = getToken?.()
      if (token) request.headers.set('Authorization', `Bearer ${token}`)
      return request
    },
    onResponse({ response }) {
      if (response.status === 401) onUnauthorized?.()
    },
  }
  client.use(middleware)

  return client
}

export type ApiClient = ReturnType<typeof createApiClient>
