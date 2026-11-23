import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createApiClient, type ApiClient } from './client'
import { createItemApi } from './items'
import { createMockItemApi } from './mocks/mockItemApi'
import { createExampleProjectApi } from './mocks/mockProjectApi'
import { createMockProjectExtras } from './mocks/mockProjectExtras'
import { createProjectApi } from './projects'
import type { AttackPathService } from './services/attackPaths'
import type { DamageScenarioService } from './services/damageScenarios'
import type { ItemContentService, ItemService } from './services/items'
import type { ProjectService } from './services/projects'
import type { ThreatScenarioService } from './services/threatScenarios'
import { useAuth } from '@/auth/useAuth'

/**
 * Everything the app reads from the backend. `client`, `projects` and `items` talk to the real backend, with
 * the example project and everything below the items still mocked. Tests pass mocks through `api`.
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
  // Created once, so the mocked parts survive a new token (and with it a new client).
  const itemMocks = useMemo(() => createMockItemApi(), [])
  const projectMocks = useMemo(
    () => ({ extras: createMockProjectExtras(), example: createExampleProjectApi() }),
    [],
  )

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
  const defaultProjects = useMemo(() => createProjectApi(client, projectMocks), [client, projectMocks])
  const defaultItems = useMemo(() => createItemApi(client, itemMocks), [client, itemMocks])

  const value = useMemo<Api>(
    () => ({
      client,
      projects: api?.projects ?? defaultProjects,
      items: api?.items ?? defaultItems.items,
      content: api?.content ?? defaultItems.content,
      damageScenarios: api?.damageScenarios ?? defaultItems.damageScenarios,
      threatScenarios: api?.threatScenarios ?? defaultItems.threatScenarios,
      attackPaths: api?.attackPaths ?? defaultItems.attackPaths,
    }),
    [
      api?.attackPaths,
      api?.content,
      api?.damageScenarios,
      api?.items,
      api?.projects,
      api?.threatScenarios,
      client,
      defaultItems,
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
