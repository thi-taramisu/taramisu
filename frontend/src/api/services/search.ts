import type { SearchPage, SearchRequest } from '../models/search'

/**
 * Global search scoped by the service to the current user's accessible projects.
 * A real adapter must rely on server-side authorization, never client-side filtering.
 * The endpoint and generated types are pending #240; this is a frontend service contract.
 */
export interface SearchService {
  search(request: SearchRequest, options: { signal: AbortSignal }): Promise<SearchPage>
}
