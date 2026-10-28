import { describe, expect, it } from 'vitest'
import { ApiError, retryUnlessNotFound } from './itemApi'
import { createMockItemApi } from './mockItemApi'

const project = 'headlamp'

describe('createMockItemApi', () => {
  it('is seeded with the headlamp item, its assets and the elements below them', async () => {
    const api = createMockItemApi()

    const [item] = await api.items.list(project)
    expect(item).toMatchObject({ id: 'i-01', tara_project_id: project, name: 'Headlamp system', scope_type: 'ITEM' })
    expect((await api.content.assets(project, 'i-01')).map((a) => a.code)).toEqual(['A-01', 'A-02', 'A-03', 'A-04'])
    expect((await api.content.children(project, 'i-01'))[0]).toMatchObject({ code: 'A-01', children: [{ code: 'DS-01' }] })
  })

  it('creates an item with a generated id and trimmed name', async () => {
    const api = createMockItemApi()

    const created = await api.items.create(project, { name: '  Charging unit ', scope_type: 'COMPONENT', lifecycle_phase: 'Concept' })

    expect(created).toMatchObject({ tara_project_id: project, name: 'Charging unit', scope_type: 'COMPONENT', boundary: null })
    expect(created.id).not.toBe('i-01')
    expect(await api.items.get(project, created.id)).toEqual(created)
    expect(await api.items.list(project)).toHaveLength(2)
  })

  it.each(['', '   ', 'x'.repeat(256)])('rejects the invalid name "%s" with 422', async (name) => {
    const api = createMockItemApi()

    await expect(api.items.create(project, { name, scope_type: 'ITEM' })).rejects.toMatchObject({ status: 422 })
  })

  it('patches only the given fields', async () => {
    const api = createMockItemApi()

    const updated = await api.items.update(project, 'i-01', { boundary: 'Only the lamp' })

    expect(updated).toMatchObject({ name: 'Headlamp system', boundary: 'Only the lamp' })
    expect((await api.items.get(project, 'i-01')).boundary).toBe('Only the lamp')
  })

  it('returns 404 for unknown items and items of other projects', async () => {
    const api = createMockItemApi()

    await expect(api.items.get(project, 'nope')).rejects.toBeInstanceOf(ApiError)
    await expect(api.items.get(project, 'nope')).rejects.toMatchObject({ status: 404 })
    await expect(api.items.get('other', 'i-01')).rejects.toMatchObject({ status: 404 })
  })

  it('deletes an item together with its assets and the elements below it', async () => {
    const api = createMockItemApi()

    await api.items.delete(project, 'i-01')

    expect(await api.items.list(project)).toEqual([])
    await expect(api.content.assets(project, 'i-01')).rejects.toMatchObject({ status: 404 })
  })

  it('adds an asset with the next code and shows it below the item', async () => {
    const api = createMockItemApi()

    const asset = await api.content.addAsset(project, 'i-01', { name: 'LED driver', component: 'Lamp ECU', properties: ['I'] })

    expect(asset).toMatchObject({ code: 'A-05', name: 'LED driver', damageScenarios: 0, threatScenarios: 0, maxRisk: null })
    expect((await api.content.children(project, 'i-01')).at(-1)).toMatchObject({ type: 'assets', id: asset.id, code: 'A-05' })
  })

  it('keeps separate state per instance and hands out copies', async () => {
    const first = createMockItemApi()
    const second = createMockItemApi()

    const [item] = await first.items.list(project)
    item.name = 'Mutated outside'
    await first.items.delete(project, 'i-01')

    expect((await second.items.get(project, 'i-01')).name).toBe('Headlamp system')
  })
})

describe('retryUnlessNotFound', () => {
  it('does not retry 404s but retries other errors up to three times', () => {
    expect(retryUnlessNotFound(0, new ApiError(404, 'gone'))).toBe(false)
    expect(retryUnlessNotFound(0, new ApiError(500, 'oops'))).toBe(true)
    expect(retryUnlessNotFound(3, new Error('network'))).toBe(false)
  })
})
