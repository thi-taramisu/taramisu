import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApiClient } from './client'
import { ApiError } from './errors'
import { createProjectApi } from './projects'
import type { components } from './schema'

type ProjectBody = components['schemas']['TaraProjectBody']

const baseUrl = 'http://api.test'
const projects = `${baseUrl}/api/v1/projects`
const server = setupServer()

const battery: ProjectBody = {
  id: '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  name: 'Battery Security',
  description: 'Battery system TARA',
  role: 'OWNER',
  created_at: '2026-11-10T09:30:00Z',
  archived_at: null,
}
const shared: ProjectBody = { ...battery, id: '7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Shared', role: 'EDITOR' }

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
})
afterAll(() => server.close())

function createApi() {
  return createProjectApi(createApiClient({ baseUrl }))
}

function serveProjects(...bodies: ProjectBody[]) {
  server.use(
    http.get(projects, () => HttpResponse.json(bodies)),
    http.get(`${projects}/:id`, ({ params }) => {
      const body = bodies.find((project) => project.id === params.id)
      return body
        ? HttpResponse.json(body)
        : HttpResponse.json({ status: 404, title: 'Not Found', detail: 'project not found' }, { status: 404 })
    }),
  )
}

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => { throw new Error('expected a rejection') },
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('createProjectApi', () => {
  it('lists the backend projects with default extras and appends the example project', async () => {
    serveProjects(battery)

    const list = await createApi().list()

    expect(list).toEqual([
      {
        id: battery.id,
        name: 'Battery Security',
        description: 'Battery system TARA',
        role: 'OWNER',
        updatedAt: '2026-11-10T09:30:00Z',
        favorite: false,
        archived: false,
        owner: 'Demo User',
      },
      expect.objectContaining({ id: 'headlamp' }),
    ])
  })

  it('treats a null list and a missing description as empty', async () => {
    server.use(http.get(projects, () => HttpResponse.json(null)))
    expect((await createApi().list()).map((project) => project.id)).toEqual(['headlamp'])

    serveProjects({ ...battery, description: undefined })
    expect(await createApi().get(battery.id)).toMatchObject({ description: '' })
  })

  it('rejects with the status and detail of the problem response', async () => {
    serveProjects()

    const error = await rejection(createApi().get(battery.id))

    expect(error.status).toBe(404)
    expect(error.message).toBe('project not found')
  })

  it('falls back to the title or the status text without a detail', async () => {
    server.use(http.get(projects, () => HttpResponse.json({ title: 'Internal Server Error' }, { status: 500 })))
    expect((await rejection(createApi().list())).message).toBe('Internal Server Error')

    server.use(http.get(projects, () => new HttpResponse(null, { status: 503, statusText: 'Service Unavailable' })))
    expect((await rejection(createApi().list())).message).toBe('Service Unavailable')
  })

  it('creates a project with a trimmed name and keeps its image in the extras', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    let sent: unknown
    server.use(
      http.post(projects, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(battery, { status: 201 })
      }),
    )

    const project = await createApi().create({
      name: ' Battery Security ',
      description: 'Battery system TARA',
      image: new File(['image'], 'battery.png', { type: 'image/png' }),
    })

    expect(sent).toEqual({ name: 'Battery Security', description: 'Battery system TARA' })
    expect(project).toMatchObject({ id: battery.id, image: 'blob:image' })
  })

  it('renames a project with PATCH', async () => {
    let sent: unknown
    server.use(
      http.patch(`${projects}/:id`, async ({ request, params }) => {
        sent = { id: params.id, body: await request.json() }
        return HttpResponse.json({ ...battery, name: 'Battery Pack', description: 'Pack TARA' })
      }),
    )

    const project = await createApi().update(battery.id, { name: 'Battery Pack ', description: 'Pack TARA' })

    expect(sent).toEqual({ id: battery.id, body: { name: 'Battery Pack', description: 'Pack TARA' } })
    expect(project).toMatchObject({ name: 'Battery Pack', description: 'Pack TARA' })
  })

  it('keeps favorite and archive state for backend projects in memory', async () => {
    serveProjects(battery)
    const api = createApi()

    await api.setFavorite(battery.id, true)
    expect(await api.archive(battery.id)).toMatchObject({ favorite: true, archived: true })
    expect(await api.get(battery.id)).toMatchObject({ favorite: true, archived: true })
    expect(await api.restore(battery.id)).toMatchObject({ archived: false })
    expect((await api.list())[0]).toMatchObject({ favorite: true, archived: false })
  })

  it('only lets owners archive and restore, by the role from the backend', async () => {
    serveProjects(shared)
    const api = createApi()

    expect((await rejection(api.archive(shared.id))).status).toBe(403)
    expect((await rejection(api.restore(shared.id))).status).toBe(403)
    expect(await api.get(shared.id)).toMatchObject({ archived: false })
  })

  it('deletes a project and forgets its extras and image', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    serveProjects(battery)
    server.use(
      http.post(projects, () => HttpResponse.json(battery, { status: 201 })),
      http.delete(`${projects}/:id`, () => new HttpResponse(null, { status: 204 })),
    )
    const api = createApi()
    await api.create({ name: 'Battery Security', image: new File(['image'], 'battery.png', { type: 'image/png' }) })
    await api.setFavorite(battery.id, true)

    await api.delete(battery.id)

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image')
    // A project with the same ID would start without the old extras.
    const project = await api.get(battery.id)
    expect(project.favorite).toBe(false)
    expect(project.image).toBeUndefined()
  })

  it('rejects a failed delete and keeps the extras', async () => {
    serveProjects(battery)
    server.use(
      http.delete(`${projects}/:id`, () =>
        HttpResponse.json({ detail: 'only owners can delete' }, { status: 403 })),
    )
    const api = createApi()
    await api.setFavorite(battery.id, true)

    expect((await rejection(api.delete(battery.id))).status).toBe(403)
    expect(await api.get(battery.id)).toMatchObject({ favorite: true })
  })

  it('serves the example project from memory without calling the backend', async () => {
    const api = createApi()

    expect(await api.get('headlamp')).toMatchObject({ name: 'Headlamp System' })
    expect(await api.update('headlamp', { name: 'Headlamp', description: '' })).toMatchObject({ name: 'Headlamp' })
    await api.setFavorite('headlamp', false)
    expect(await api.get('headlamp')).toMatchObject({ favorite: false })
    expect(await api.archive('headlamp')).toMatchObject({ archived: true })
    expect(await api.restore('headlamp')).toMatchObject({ archived: false })
    await api.delete('headlamp')
    expect((await rejection(api.get('headlamp'))).status).toBe(404)
  })
})
