import type { NewProject, Project, ProjectUpdate } from '../models/project'

// Service of the project list and the project settings. `../projects.ts` implements it on the openapi-fetch
// client, `../mocks/mockProjectApi.ts` in memory (tests and the example project).

/**
 * Projects of the current user. `list`, `get`, `create`, `update` and `delete` follow `/api/v1/projects`;
 * `archive` and `restore` use the project lifecycle endpoints; `setFavorite` is still mocked
 * (favorite endpoints #232, connected with #375). Calls reject with an `ApiError`, e.g. 404 for unknown
 * projects, 403 for missing rights and 422 for invalid bodies.
 */
export interface ProjectService {
  list(): Promise<Project[]>
  get(projectId: string): Promise<Project>
  create(body: NewProject): Promise<Project>
  /** Owners only: changes the name and the description. */
  update(projectId: string, body: ProjectUpdate): Promise<Project>
  setFavorite(projectId: string, favorite: boolean): Promise<void>
  /** Owners only: makes the project read-only for all members. */
  archive(projectId: string): Promise<Project>
  /** Owners only. */
  restore(projectId: string): Promise<Project>
  /** Owners only. */
  delete(projectId: string): Promise<void>
}
