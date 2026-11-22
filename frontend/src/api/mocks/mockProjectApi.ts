import { ApiError } from '../errors'
import type { Project } from '../models/project'
import type { ProjectService } from '../services/projects'
import { exampleProject } from './data/headlamp'
import { mockProjects } from './data/projects'
import { run } from './mockStore'

// MOCK: in-memory project API. Tests use it instead of the backend, and the real project service
// (`../projects.ts`) serves the example project from it until the example lives in the backend (#250).

function validateName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new ApiError(422, 'Name is required.')
  return trimmed
}

/**
 * In-memory implementation of the project API, seeded with the mock project list. Each call returns
 * copies, so callers cannot change the stored state by accident.
 */
export function createMockProjectApi(seed: Project[] = mockProjects): ProjectService {
  const db = new Map(structuredClone(seed).map((project) => [project.id, project]))

  function find(projectId: string) {
    const project = db.get(projectId)
    if (!project) throw new ApiError(404, 'Project not found.')
    return project
  }

  function findOwned(projectId: string) {
    const project = find(projectId)
    if (project.role !== 'OWNER') throw new ApiError(403, 'Only owners can do this.')
    return project
  }

  return {
    list: () => run(() => [...db.values()]),
    get: (projectId) => run(() => find(projectId)),
    create: ({ name, description = '', image }) =>
      run(() => {
        const project: Project = {
          id: crypto.randomUUID(),
          name: validateName(name),
          description,
          role: 'OWNER',
          // The mock owns the object URL and releases it when the project is deleted.
          image: image ? URL.createObjectURL(image) : undefined,
          favorite: false,
          archived: false,
          owner: 'Demo User',
          updatedAt: new Date().toISOString().slice(0, 10),
        }
        db.set(project.id, project)
        return project
      }),
    update: (projectId, { name, description }) =>
      run(() => {
        const project = findOwned(projectId)
        project.name = validateName(name)
        project.description = description
        return project
      }),
    setFavorite: (projectId, favorite) =>
      run(() => {
        find(projectId).favorite = favorite
      }),
    archive: (projectId) =>
      run(() => {
        const project = findOwned(projectId)
        project.archived = true
        return project
      }),
    restore: (projectId) =>
      run(() => {
        const project = findOwned(projectId)
        project.archived = false
        return project
      }),
    delete: (projectId) =>
      run(() => {
        const project = findOwned(projectId)
        if (project.image?.startsWith('blob:')) URL.revokeObjectURL(project.image)
        db.delete(projectId)
      }),
  }
}

/** Mock API with only the example project, which the real project service serves from it. */
export function createExampleProjectApi() {
  return createMockProjectApi(mockProjects.filter((project) => project.id === exampleProject.id))
}
