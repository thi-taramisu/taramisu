// Projects and their settings. Not in the backend spec yet (project CRUD, #81); the pages read the
// mock data in `../mocks/data/` directly until then.

export type Project = {
  id: string
  name: string
  description: string
  favorite: boolean
  archived: boolean
  owner: string
  updatedAt: string
}

export interface ProjectDetails {
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
