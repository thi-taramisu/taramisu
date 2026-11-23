import type { ApiClient } from './client'
import { ApiError } from './errors'
import { exampleProject } from './mocks/data/headlamp'
import { createExampleProjectApi } from './mocks/mockProjectApi'
import { createMockProjectExtras, type MockProjectExtras } from './mocks/mockProjectExtras'
import type { Project } from './models/project'
import type { components } from './schema'
import type { ProjectService } from './services/projects'
import { unwrap } from './unwrap'

// REAL: the project service on `/api/v1/projects`. Fields the backend does not have yet come from the
// mocked extras (`./mocks/mockProjectExtras.ts`); the example project comes from the mock project API
// until it lives in the backend (#250).

type ProjectBody = components['schemas']['TaraProjectBody']

const isExample = (projectId: string) => projectId === exampleProject.id

export interface ProjectApiOptions {
  extras?: MockProjectExtras
  /** Serves the example project; its changes stay in memory. */
  example?: ProjectService
}

export function createProjectApi(
  client: ApiClient,
  {
    extras = createMockProjectExtras(),
    example = createExampleProjectApi(),
  }: ProjectApiOptions = {},
): ProjectService {
  function toProject(body: ProjectBody): Project {
    return {
      id: body.id,
      name: body.name,
      description: body.description ?? '',
      role: body.role,
      updatedAt: body.created_at,
      ...extras.get(body.id),
    }
  }

  const fetchProject = (projectId: string) =>
    unwrap(client.GET('/api/v1/projects/{id}', { params: { path: { id: projectId } } }))

  /** Checks the backend's role, as the archive endpoints (#233) will. */
  async function setOwnedExtras(projectId: string, archived: boolean) {
    const body = await fetchProject(projectId)
    if (body.role !== 'OWNER') throw new ApiError(403, 'Only owners can do this.')
    extras.set(projectId, { archived })
    return toProject(body)
  }

  return {
    list: async () => {
      const [bodies, examples] = await Promise.all([unwrap(client.GET('/api/v1/projects')), example.list()])
      return [...(bodies ?? []).map(toProject), ...examples]
    },
    get: async (projectId) => {
      if (isExample(projectId)) return example.get(projectId)
      return toProject(await fetchProject(projectId))
    },
    create: async ({ name, description, image }) => {
      const body = await unwrap(client.POST('/api/v1/projects', { body: { name: name.trim(), description } }))
      // The store owns the object URL and releases it when the project is deleted.
      if (image) extras.set(body.id, { image: URL.createObjectURL(image) })
      return toProject(body)
    },
    update: async (projectId, { name, description }) => {
      if (isExample(projectId)) return example.update(projectId, { name, description })
      const body = await unwrap(
        client.PATCH('/api/v1/projects/{id}', {
          params: { path: { id: projectId } },
          body: { name: name.trim(), description },
        }),
      )
      return toProject(body)
    },
    setFavorite: async (projectId, favorite) => {
      if (isExample(projectId)) return example.setFavorite(projectId, favorite)
      // Favorites have no backend route yet, so nothing is sent.
      extras.set(projectId, { favorite })
    },
    archive: (projectId) => (isExample(projectId) ? example.archive(projectId) : setOwnedExtras(projectId, true)),
    restore: (projectId) => (isExample(projectId) ? example.restore(projectId) : setOwnedExtras(projectId, false)),
    delete: async (projectId) => {
      if (isExample(projectId)) return example.delete(projectId)
      await unwrap(client.DELETE('/api/v1/projects/{id}', { params: { path: { id: projectId } } }))
      extras.remove(projectId)
    },
  }
}
