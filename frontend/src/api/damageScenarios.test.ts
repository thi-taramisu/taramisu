import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApiClient } from './client'
import { createItemApi } from './items'
import { createMockItemApi } from './mocks/mockItemApi'
import type { ImpactRatingBody } from './models/damageScenario'

const origin = 'http://api.test'
const projectId = 'project-real'
const itemId = 'item-real'
const item = { id: itemId, tara_project_id: projectId, name: 'Battery', scope_type: 'ITEM', created_at: '2026-11-24' }
const base = `${origin}/api/v1/item-definitions/${itemId}`
const scenario = { id: 'damage-real', item_definition_id: itemId, title: 'Battery fire' }
let scenarios: (typeof scenario)[] = []
let storedRatings: (ImpactRatingBody & { id: string; damage_scenario_id: string })[] = []
let propertyLinks: { id: string; damage_scenario_id: string; asset_cybersecurity_property_id: string }[] = []
const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  scenarios = []
  storedRatings = []
  propertyLinks = []
})
afterAll(() => server.close())

function api() {
  server.use(
    http.get(`${origin}/api/v1/projects/${projectId}/item-definitions`, () => HttpResponse.json([item])),
    http.get(`${origin}/api/v1/projects/${projectId}/item-definitions/${itemId}`, () => HttpResponse.json(item)),
    http.get(`${base}/damage-scenarios`, () => HttpResponse.json(scenarios)),
    http.post(`${base}/damage-scenarios`, async ({ request }) => {
      const body = (await request.json()) as { title: string }
      scenarios.push({ ...scenario, title: body.title })
      return HttpResponse.json(scenarios[0], { status: 201 })
    }),
    http.get(`${base}/damage-scenarios/${scenario.id}`, () => HttpResponse.json(scenarios[0])),
    http.patch(`${base}/damage-scenarios/${scenario.id}`, async ({ request }) => {
      scenarios[0] = { ...scenarios[0], ...((await request.json()) as object) }
      return HttpResponse.json(scenarios[0])
    }),
    http.delete(`${base}/damage-scenarios/${scenario.id}`, () => {
      scenarios = []
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${base}/damage-scenarios/${scenario.id}/impact-ratings`, () => HttpResponse.json(storedRatings)),
    http.post(`${base}/damage-scenarios/${scenario.id}/impact-ratings`, async ({ request }) => {
      const body = (await request.json()) as ImpactRatingBody
      const row = { ...body, id: `rating-${body.impact_category}`, damage_scenario_id: scenario.id }
      storedRatings.push(row)
      return HttpResponse.json(row, { status: 201 })
    }),
    http.put(`${base}/damage-scenarios/${scenario.id}/impact-ratings/:id`, async ({ request, params }) => {
      const body = (await request.json()) as ImpactRatingBody
      const row = { ...body, id: String(params.id), damage_scenario_id: scenario.id }
      storedRatings = storedRatings.map((r) => (r.id === row.id ? row : r))
      return HttpResponse.json(row)
    }),
    http.get(`${base}/assets`, () =>
      HttpResponse.json([{ id: 'asset-real', item_definition_id: itemId, name: 'Firmware' }]),
    ),
    http.get(`${base}/assets/asset-real/cybersecurity-properties`, () =>
      HttpResponse.json([{ id: 'property-real', asset_id: 'asset-real', property_type: 'INTEGRITY' }]),
    ),
    http.get(`${base}/damage-scenario-asset-properties`, () => HttpResponse.json(propertyLinks)),
    http.post(`${base}/damage-scenario-asset-properties`, async ({ request }) => {
      const body = (await request.json()) as Omit<(typeof propertyLinks)[number], 'id'>
      const row = { ...body, id: 'link-real' }
      propertyLinks.push(row)
      return HttpResponse.json(row, { status: 201 })
    }),
    http.delete(`${base}/damage-scenario-asset-properties/:id`, () => {
      propertyLinks = []
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${base}/threat-damage-links`, () => HttpResponse.json([])),
  )
  return createItemApi(createApiClient({ baseUrl: origin }), createMockItemApi())
}
const safety: ImpactRatingBody = {
  impact_category: 'SAFETY',
  rating_value: 'SEVERE',
  is_omitted_by_pm_15_07: false,
  omission_or_rating_rationale: null,
  reused_from_functional_safety: false,
}

describe('damage scenario backend integration', () => {
  it('creates, reads, patches and deletes a scenario through its item-scoped endpoints', async () => {
    const service = api().damageScenarios
    const created = await service.create(projectId, {
      title: ' Battery fire ',
      item_definition_id: itemId,
      asset_properties: [],
    })
    expect(created).toMatchObject({ title: 'Battery fire', code: '', road_user_harm_description: null })
    expect(await service.get(projectId, created.id)).toEqual(created)
    expect(await service.update(projectId, created.id, { title: 'Fire risk' })).toMatchObject({ title: 'Fire risk' })
    await service.delete(projectId, created.id)
    await expect(service.get(projectId, created.id)).rejects.toMatchObject({ status: 404 })
  })
  it('adds scenarios to the live item tree without inventing display IDs', async () => {
    const service = api()
    scenarios = [scenario]
    expect(await service.content.children(projectId, itemId)).toEqual([
      { type: 'damage-scenarios', id: scenario.id, name: scenario.title },
    ])
  })
  it('creates ratings, updates them without duplicates, and clears a rating', async () => {
    const service = api().damageScenarios
    scenarios = [scenario]
    expect(await service.updateImpactRatings(projectId, scenario.id, [safety])).toMatchObject([
      { rating_value: 'SEVERE' },
    ])
    expect(
      await service.updateImpactRatings(projectId, scenario.id, [{ ...safety, rating_value: null }]),
    ).toMatchObject([{ rating_value: null }])
    expect(storedRatings).toHaveLength(1)
  })
  it('uses cybersecurity-property IDs and reuses a link when the action is retried', async () => {
    const service = api().damageScenarios
    scenarios = [scenario]
    await service.linkAsset(projectId, scenario.id, 'asset-real', ['I'])
    const related = await service.linkAsset(projectId, scenario.id, 'asset-real', ['I'])
    expect(propertyLinks).toHaveLength(1)
    expect(propertyLinks[0].asset_cybersecurity_property_id).toBe('property-real')
    expect(related.assets[0].linkedProperties).toEqual(['I'])
    expect((await service.unlinkAsset(projectId, scenario.id, 'asset-real')).assets).toEqual([])
  })
  it('rejects a scenario outside the accessible project', async () => {
    const service = api().damageScenarios
    scenarios = [scenario]
    server.use(http.get(`${origin}/api/v1/projects/${projectId}/item-definitions`, () => HttpResponse.json([])))
    await expect(service.update(projectId, scenario.id, { title: 'Forbidden' })).rejects.toMatchObject({ status: 404 })
  })
  it('propagates authorization failures without falling back to mock data', async () => {
    const service = api().damageScenarios
    server.use(
      http.get(`${origin}/api/v1/projects/${projectId}/item-definitions`, () =>
        HttpResponse.json({ title: 'Forbidden' }, { status: 403 }),
      ),
    )
    await expect(service.get(projectId, scenario.id)).rejects.toMatchObject({ status: 403 })
  })
  it('removes a new scenario if its initial asset links cannot be saved', async () => {
    const service = api().damageScenarios
    server.use(
      http.post(`${base}/damage-scenario-asset-properties`, () =>
        HttpResponse.json({ title: 'Failed' }, { status: 500 }),
      ),
    )
    await expect(
      service.create(projectId, {
        title: 'Fire',
        item_definition_id: itemId,
        asset_properties: [{ asset_id: 'asset-real', property: 'I' }],
      }),
    ).rejects.toMatchObject({ status: 500 })
    expect(scenarios).toEqual([])
  })
  it('loads all pages of damage scenarios', async () => {
    const service = api()
    const rows = Array.from({ length: 101 }, (_, index) => ({ ...scenario, id: `damage-${index}` }))
    server.use(
      http.get(`${base}/damage-scenarios`, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get('offset'))
        return HttpResponse.json(rows.slice(offset, offset + 100))
      }),
    )
    expect(await service.content.damageScenarios(projectId, itemId)).toHaveLength(101)
  })
  it('retries a partially saved rating set without creating duplicate categories', async () => {
    const service = api().damageScenarios
    scenarios = [scenario]
    let fail = true
    server.use(
      http.post(`${base}/damage-scenarios/${scenario.id}/impact-ratings`, async ({ request }) => {
        const body = (await request.json()) as ImpactRatingBody
        if (body.impact_category === 'FINANCIAL' && fail) {
          fail = false
          return HttpResponse.json({ title: 'Temporary failure' }, { status: 500 })
        }
        const row = { ...body, id: `rating-${body.impact_category}`, damage_scenario_id: scenario.id }
        storedRatings.push(row)
        return HttpResponse.json(row, { status: 201 })
      }),
    )
    const values = [safety, { ...safety, impact_category: 'FINANCIAL' as const }]
    await expect(service.updateImpactRatings(projectId, scenario.id, values)).rejects.toMatchObject({ status: 500 })
    expect(await service.updateImpactRatings(projectId, scenario.id, values)).toHaveLength(2)
    expect(storedRatings.filter((row) => row.impact_category === 'SAFETY')).toHaveLength(1)
  })
  it('keeps Headlamp creations and ratings in the mock store', async () => {
    const service = api().damageScenarios
    const created = await service.create('headlamp', {
      title: 'Example only',
      item_definition_id: 'i-01',
      asset_properties: [],
    })
    expect(await service.get('headlamp', created.id)).toMatchObject({ title: 'Example only' })
    expect(scenarios).toEqual([])
    await service.delete('headlamp', created.id)
    await expect(service.get('headlamp', created.id)).rejects.toMatchObject({ status: 404 })
  })
})
