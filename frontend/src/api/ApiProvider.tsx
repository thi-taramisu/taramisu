import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createApiClient, type ApiClient } from './client'
import { createMockItemApi } from './mocks/mockItemApi'
import type { DamageScenarioService } from './services/damageScenarios'
import type { ItemContentService, ItemService } from './services/items'
import { useAuth } from '@/auth/useAuth'

/**
 * Everything the app reads from the backend. `client` always talks to the real backend; the services
 * are mocks until their routes are in `backend/openapi.json` (see `main.tsx`).
 */
export interface Api {
  client: ApiClient
  items: ItemService
  content: ItemContentService
  damageScenarios: DamageScenarioService
}

const ApiContext = createContext<Api | null>(null)

export function ApiProvider({
  api,
  children,
}: {
  api?: Partial<Api>
  children: ReactNode
}) {
  const { accessToken, signOut } = useAuth()

  const value = useMemo<Api>(() => {
    const client =
      api?.client ??
      createApiClient({
        getToken: () => accessToken,
        onUnauthorized: () => {
          void signOut({ localOnly: true })
        },
      })
    const defaultMocks = createMockItemApi()
    return {
      client,
      items: api?.items ?? defaultMocks.items,
      content: api?.content ?? defaultMocks.content,
      damageScenarios: api?.damageScenarios ?? defaultMocks.damageScenarios,
    }
  }, [accessToken, api, signOut])

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useApi() {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside <ApiProvider>')
  return api
}
