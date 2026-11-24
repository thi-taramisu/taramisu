import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createApiClient, type ApiClient } from './client'
import { createMockItemApi } from './mocks/mockItemApi'
import { createMockProjectApi } from './mocks/mockProjectApi'
import type { AttackPathService } from './services/attackPaths'
import type { DamageScenarioService } from './services/damageScenarios'
import type { ItemContentService, ItemService } from './services/items'
import type { ProjectService } from './services/projects'
import type { ThreatScenarioService } from './services/threatScenarios'
import { useAuth } from '@/auth/useAuth'

/**
 * Everything the app reads from the backend. `client` always talks to the real backend; the services
 * are mocks until their routes are in `backend/openapi.json` (see `main.tsx`).
 */
export interface Api {
  client: ApiClient
  projects: ProjectService
  items: ItemService
  content: ItemContentService
  damageScenarios: DamageScenarioService
  threatScenarios: ThreatScenarioService
  attackPaths: AttackPathService
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
  const defaultMocks = useMemo(() => createMockItemApi(), [])
  const defaultProjects = useMemo(() => createMockProjectApi(), [])

  const client = useMemo(
    () =>
      api?.client ??
      createApiClient({
        getToken: () => accessToken,
        onUnauthorized: () => {
          void signOut({ localOnly: true })
        },
      }),
    [accessToken, api?.client, signOut],
  )

  const value = useMemo<Api>(
    () => ({
      client,
      projects: api?.projects ?? defaultProjects,
      items: api?.items ?? defaultMocks.items,
      content: api?.content ?? defaultMocks.content,
      damageScenarios: api?.damageScenarios ?? defaultMocks.damageScenarios,
      threatScenarios: api?.threatScenarios ?? defaultMocks.threatScenarios,
      attackPaths: api?.attackPaths ?? defaultMocks.attackPaths,
    }),
    [
      api?.attackPaths,
      api?.content,
      api?.damageScenarios,
      api?.items,
      api?.projects,
      api?.threatScenarios,
      client,
      defaultMocks,
      defaultProjects,
    ],
  )

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useApi() {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside <ApiProvider>')
  return api
}
