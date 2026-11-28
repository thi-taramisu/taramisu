import type { SearchResult } from '../models/search'
import type { ProjectService } from '../services/projects'
import type { SearchService } from '../services/search'

export type SearchDocument = Omit<SearchResult, 'project'> & { projectId: string }
const PAGE_SIZE = 20

/** Mock-only: reads the live item store, including unlinked elements, and the user's project list. */
export function createMockSearchService(
  projects: ProjectService,
  documents: () => SearchDocument[],
): SearchService {
  return {
    async search({ query, projectIds, types, offset }, { signal }) {
      signal.throwIfAborted()
      // This allowlist models server-side scoping. Filter IDs cannot grant access to another project.
      const accessible = await projects.list()
      signal.throwIfAborted()
      const byId = new Map(accessible.map((project) => [project.id, project]))
      const entries: SearchResult[] = accessible.map((project) => ({
        id: project.id, name: project.name, type: 'projects', project: { id: project.id, name: project.name },
      }))
      for (const { projectId, ...document } of documents()) {
        const project = byId.get(projectId)
        if (project) entries.push({ ...document, project: { id: project.id, name: project.name } })
      }
      const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
      const unique = new Map(entries.map((result) => [`${result.project.id}/${result.type}/${result.id}`, result]))
      const matches = [...unique.values()].filter((result) =>
        (projectIds.length === 0 || projectIds.includes(result.project.id)) &&
        (types.length === 0 || types.includes(result.type)) &&
        terms.every((term) => [result.name, result.id, result.code ?? ''].some((value) => value.toLocaleLowerCase().includes(term))),
      )
      matches.sort((a, b) => a.name.localeCompare(b.name) || a.project.id.localeCompare(b.project.id) || a.id.localeCompare(b.id))
      const start = Math.max(0, offset)
      return structuredClone({
        results: matches.slice(start, start + PAGE_SIZE),
        total: matches.length,
        nextOffset: start + PAGE_SIZE < matches.length ? start + PAGE_SIZE : null,
      })
    },
  }
}
