import type { NewProject, Project } from '../models/project'

// Service of the project list and the project settings. Only the mock in `../mocks/mockProjectApi.ts`
// implements it so far; the real implementation wraps the openapi-fetch client.

/**
 * Projects of the current user. `list`, `get`, `create` and `delete` follow `/api/v1/projects`;
 * `archive` and `restore` follow the planned archive endpoints (#233); `setFavorite` has no backend
 * route yet. Calls reject with an `ApiError`, e.g. 404 for unknown projects, 403 for missing rights
 * and 422 for invalid bodies.
 */
export interface ProjectService {
  list(): Promise<Project[]>
  get(projectId: string): Promise<Project>
  create(body: NewProject): Promise<Project>
  setFavorite(projectId: string, favorite: boolean): Promise<Project>
  /** Owners only: makes the project read-only for all members. */
  archive(projectId: string): Promise<Project>
  /** Owners only. */
  restore(projectId: string): Promise<Project>
  /** Owners only. */
  delete(projectId: string): Promise<void>
}
