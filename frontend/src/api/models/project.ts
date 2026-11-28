// Projects and their settings. Projects go through `ProjectService` (`../services/projects.ts`). The members
// settings still read the mock data in `../mocks/data/` directly (#249).

/**
 * A project as the views use it. `id`, `name`, `description` and `role` come from `TaraProjectBody` of
 * `/api/v1/projects`, `updatedAt` from `created_at` and `archived` from `archived_at`.
 * `favorite`, `owner` and `image` are stored by `../mocks/mockProjectExtras.ts`.
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

/** Body of a rename; matches `UpdateTaraProjectInputBody`. */
export interface ProjectUpdate {
  name: string
  description: string
}

export type ProjectRole = 'OWNER' | 'EDITOR' | 'REVIEWER' | 'VIEWER'

export interface Member {
  id: string
  email: string
  role: ProjectRole
  added: string
}
