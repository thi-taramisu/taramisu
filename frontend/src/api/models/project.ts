// Projects and their settings. The project list goes through `ProjectService` (`../services/projects.ts`),
// which only the mock implements so far; the settings pages read the mock data in `../mocks/data/` directly.

/**
 * A project as the views use it. `id`, `name`, `description` and `role` match `TaraProjectBody` of
 * `/api/v1/projects`; `archived` is planned there (#233). The other fields are frontend-only for now.
 */
export type Project = {
  id: string
  name: string
  description: string
  /** Role of the current user in this project. */
  role: ProjectRole
  /** Local object URL of the selected project image. */
  image?: string
  favorite: boolean
  archived: boolean
  owner: string
  updatedAt: string
}

/** Body of a new project; `name` and `description` match `CreateTaraProjectInputBody`. */
export interface NewProject {
  name: string
  description?: string
  /** Frontend-only until project images can be uploaded. */
  image?: File
}

export interface ProjectDetails {
  name: string
  description: string
  /** URL of the project image, null if the project has none. */
  image: string | null
}

export type ProjectRole = 'OWNER' | 'EDITOR' | 'REVIEWER' | 'VIEWER'

export interface Member {
  id: string
  email: string
  role: ProjectRole
  added: string
}
