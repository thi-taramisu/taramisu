import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApiClient } from './client'
import { ApiError } from './errors'
import { createItemApi } from './items'
import { createMockItemApi } from './mocks/mockItemApi'
import type { ItemDefinition } from './models/item'

const baseUrl = 'http://api.test'
const projectId = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b'
const items = `${baseUrl}/api/v1/projects/${projectId}/item-definitions`
const server = setupServer()

// As the backend sends it: empty optional fields are left out.
const ecu: ItemDefinition = {
  id: '0b7e1d2c-3a4f-4b5c-8d6e-7f8a9b0c1d2e',
  tara_project_id: projectId,
  name: 'Battery ECU',
  scope_type: 'ITEM',
  lifecycle_phase: 'Concept',
  created_at: '2026-11-20T08:00:00Z',
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function createApi() {
  return createItemApi(createApiClient({ baseUrl }), createMockItemApi())
}

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => { throw new Error('expected a rejection') },
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('createItemApi', () => {
  it('lists and gets the item definitions of a project', async () => {
    server.use(
      http.get(items, () => HttpResponse.json([ecu])),
      http.get(`${items}/:itemId`, () => HttpResponse.json(ecu)),
    )
    const api = createApi()

    expect(await api.items.list(projectId)).toEqual([ecu])
    expect(await api.items.get(projectId, ecu.id)).toEqual(ecu)
  })

  it('treats a null list as empty', async () => {
    server.use(http.get(items, () => HttpResponse.json(null)))
    expect(await createApi().items.list(projectId)).toEqual([])
  })

  it('creates an item with the trimmed name', async () => {
    let body: unknown
    server.use(
      http.post(items, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(ecu, { status: 201 })
      }),
    )

    const created = await createApi().items.create(projectId, { name: '  Battery ECU ', scope_type: 'ITEM', lifecycle_phase: 'Concept' })

    expect(body).toEqual({ name: 'Battery ECU', scope_type: 'ITEM', lifecycle_phase: 'Concept' })
    expect(created).toEqual(ecu)
  })

  it('patches only the given fields and sends null to clear one', async () => {
    let body: unknown
    server.use(
      http.patch(`${items}/:itemId`, async ({ request, params }) => {
        body = await request.json()
        return HttpResponse.json({ ...ecu, id: params.itemId, name: 'Battery ECU v2' })
      }),
    )
    const api = createApi()

    const updated = await api.items.update(projectId, ecu.id, { name: ' Battery ECU v2 ', boundary: null })
    expect(body).toEqual({ name: 'Battery ECU v2', boundary: null })
    expect(updated.name).toBe('Battery ECU v2')

    await api.items.update(projectId, ecu.id, { functions: 'Charging' })
    expect(body).toEqual({ functions: 'Charging' })
  })

  it('deletes an item', async () => {
    let deleted: unknown
    server.use(
      http.delete(`${items}/:itemId`, ({ params }) => {
        deleted = params.itemId
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await createApi().items.delete(projectId, ecu.id)

    expect(deleted).toBe(ecu.id)
  })

  it('rejects with the status and the problem detail', async () => {
    server.use(
      http.get(`${items}/:itemId`, () =>
        HttpResponse.json({ status: 404, title: 'Not Found', detail: 'item definition not found' }, { status: 404 })),
      http.delete(`${items}/:itemId`, () =>
        HttpResponse.json({ status: 409, title: 'Conflict', detail: 'item definition has dependent records' }, { status: 409 })),
    )
    const api = createApi()

    const notFound = await rejection(api.items.get(projectId, ecu.id))
    expect(notFound.status).toBe(404)
    expect(notFound.message).toBe('item definition not found')
    expect((await rejection(api.items.delete(projectId, ecu.id))).status).toBe(409)
  })

  it('loads real assets and scenarios while other item data is still unavailable', async () => {
    server.use(
      http.get(`${items}/:itemId`, () => HttpResponse.json(ecu)),
      http.get(`${baseUrl}/api/v1/item-definitions/${ecu.id}/damage-scenarios`, () => HttpResponse.json([])),
      http.get(`${baseUrl}/api/v1/item-definitions/${ecu.id}/assets`, () => HttpResponse.json([])),
    )
    const api = createApi()

    expect(await api.content.children(projectId, ecu.id)).toEqual([])
    expect(await api.content.assets(projectId, ecu.id)).toEqual([])
    expect(await api.content.risks(projectId, ecu.id)).toEqual([])
    expect(await api.content.threatScenarios(projectId, ecu.id)).toEqual([])
    expect(await api.content.damageScenarios(projectId, ecu.id)).toEqual([])
    expect(await api.content.attackPaths(projectId, ecu.id)).toEqual([])
    const addAsset = await rejection(
      api.content.addAsset(projectId, ecu.id, { name: 'Firmware', component: 'ECU', properties: ['I'] }),
    )
    expect(addAsset.status).toBe(501)
  })

  it('serves the example project from the mock item API, without asking the backend', async () => {
    const api = createApi()

    const [headlamp] = await api.items.list('headlamp')
    expect(headlamp.id).toBe('i-01')
    expect((await api.content.children('headlamp', 'i-01')).length).toBeGreaterThan(0)

    const created = await api.items.create('headlamp', { name: 'Rear lamp', scope_type: 'COMPONENT' })
    expect((await api.items.update('headlamp', created.id, { functions: 'Brake light' })).functions).toBe('Brake light')
    await api.items.delete('headlamp', created.id)
    expect((await rejection(api.items.get('headlamp', created.id))).status).toBe(404)
  })
})
