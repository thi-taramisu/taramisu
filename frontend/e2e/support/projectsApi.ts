import type { Page } from '@playwright/test'

interface ProjectBody {
  id: string
  name: string
  description?: string
  role: 'OWNER' | 'EDITOR' | 'VIEWER'
  created_at: string
  archived_at: string | null
}

/**
 * Serves `/api/v1/projects` from memory, since `vite preview` runs without the backend. Follows
 * `backend/openapi.json`: list, create, get, rename, archive, restore and delete.
 */
export async function stubProjectsApi(page: Page) {
  const projects = new Map<string, ProjectBody>()
  const notFound = { status: 404, json: { status: 404, title: 'Not Found', detail: 'project not found' } }

  await page.route(/\/api\/v1\/projects(\/[^/?]+(?:\/(?:un)?archive)?)?(\?.*)?$/, async (route) => {
    const request = route.request()
    const [, , , , id, action] = new URL(request.url()).pathname.split('/')
    if (!id) {
      if (request.method() === 'GET') return route.fulfill({ json: [...projects.values()] })
      const { name, description } = request.postDataJSON() as { name: string; description?: string }
      const project: ProjectBody = {
        id: crypto.randomUUID(),
        name,
        description,
        role: 'OWNER',
        created_at: new Date().toISOString(),
        archived_at: null,
      }
      projects.set(project.id, project)
      return route.fulfill({ status: 201, json: project })
    }
    const project = projects.get(id)
    if (!project) return route.fulfill(notFound)
    if (request.method() === 'POST' && action === 'archive') project.archived_at = new Date().toISOString()
    if (request.method() === 'POST' && action === 'unarchive') project.archived_at = null
    if (request.method() === 'PATCH') Object.assign(project, request.postDataJSON())
    if (request.method() === 'DELETE') {
      projects.delete(id)
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ json: project })
  })
}
