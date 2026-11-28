import type { Project } from '../models/project'

// MOCK: project fields that `/api/v1/projects` does not have yet. The real project service
// (`../projects.ts`) merges them into the backend's projects; they are kept in memory and reset on reload.
// Each field moves to the backend with its issue:
// - `image`: project image upload (#231, #284)
// - `owner`: project members (#249)
// - `favorite`: favorite endpoints (#232), connected with #375

export type ProjectExtras = Pick<Project, 'favorite' | 'owner' | 'image'>

export interface MockProjectExtras {
  /** Extras of a project, with defaults for projects that have none stored. */
  get(projectId: string): ProjectExtras
  set(projectId: string, extras: Partial<ProjectExtras>): ProjectExtras
  /** Forgets a deleted project and releases its image. */
  remove(projectId: string): void
}

const defaults: ProjectExtras = { favorite: false, owner: 'Demo User' }

export function createMockProjectExtras(): MockProjectExtras {
  const store = new Map<string, ProjectExtras>()

  const get = (projectId: string) => ({ ...(store.get(projectId) ?? defaults) })

  return {
    get,
    set: (projectId, extras) => {
      const next = { ...get(projectId), ...extras }
      store.set(projectId, next)
      return { ...next }
    },
    remove: (projectId) => {
      const image = store.get(projectId)?.image
      // The store owns the object URLs of uploaded images (see `create` in `../projects.ts`).
      if (image?.startsWith('blob:')) URL.revokeObjectURL(image)
      store.delete(projectId)
    },
  }
}
