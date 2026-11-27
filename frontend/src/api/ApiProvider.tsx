import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createApiClient, type ApiClient } from './client'
import { createMockItemApi } from './mocks/mockItemApi'
import { createExampleProjectApi } from './mocks/mockProjectApi'
import { createMockProjectExtras } from './mocks/mockProjectExtras'
import { createProjectApi } from './projects'
import type { AttackPathService } from './services/attackPaths'
import type { DamageScenarioService } from './services/damageScenarios'
import type { ItemContentService, ItemService } from './services/items'
import type { ProjectService } from './services/projects'
import type { SearchService } from './services/search'
import type { ThreatScenarioService } from './services/threatScenarios'
import { useAuth } from '@/auth/useAuth'

/**
 * Everything the app reads from the backend. `client` and `projects` talk to the real backend; the other
 * services are mocks until their routes are in `backend/openapi.json`. Tests pass mocks through `api`.
 */
export interface Api {
  client: ApiClient
  projects: ProjectService
  search: SearchService
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
  // Created once, so the mocked parts of the projects survive a new token (and with it a new client).
  const projectMocks = useMemo(
    () => ({ extras: createMockProjectExtras(), example: createExampleProjectApi() }),
    [],
  )
  // Created once, so edits in the item mocks survive a new token (and with it a new project service).
  const defaultMocks = useMemo(() => createMockItemApi(), [])

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

  const projects = api?.projects ?? defaultProjects
  // The mock search reads the user's projects, so it uses the current project service.
  const search = useMemo(() => api?.search ?? defaultMocks.searchWith(projects), [api?.search, defaultMocks, projects])

  const value = useMemo<Api>(
    () => ({
      client,
      projects,
      search,
      items: api?.items ?? defaultMocks.items,
      content: api?.content ?? defaultMocks.content,
      damageScenarios: api?.damageScenarios ?? defaultMocks.damageScenarios,
      threatScenarios: api?.threatScenarios ?? defaultMocks.threatScenarios,
      attackPaths: api?.attackPaths ?? defaultMocks.attackPaths,
    }),
    [api?.attackPaths, api?.content, api?.damageScenarios, api?.items, api?.threatScenarios, client, defaultMocks, projects, search],
  )

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useApi() {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside <ApiProvider>')
  return api
}
