import { createContext, useContext, type ReactNode } from 'react'
import type { ApiClient } from './client'
import type { ItemContentService, ItemService } from './services/items'

/**
 * Everything the app reads from the backend. `client` always talks to the real backend; the services
 * are mocks until their routes are in `backend/openapi.json` (see `main.tsx`).
 */
export interface Api {
  client: ApiClient
  items: ItemService
  content: ItemContentService
}

const ApiContext = createContext<Api | null>(null)

export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useApi() {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside <ApiProvider>')
  return api
}
