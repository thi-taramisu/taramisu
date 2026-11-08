import { describe, expect, it } from 'vitest'
import { ApiError, retryUnlessNotFound } from '../errors'
import { createMockItemApi } from './mockItemApi'

const project = 'headlamp'

async function treeBelow(api: ReturnType<typeof createMockItemApi>, assetId: string) {
  return (await api.content.children(project, 'i-01')).find((node) => node.id === assetId)!.children
}

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

  it('creates a damage scenario with the next code below each linked asset', async () => {
    const api = createMockItemApi()

    const created = await api.damageScenarios.create(project, {
      item_definition_id: 'i-01',
      title: ' Key leaked ',
      asset_properties: [
        { asset_id: 'a-04', property: 'C' },
        { asset_id: 'a-04', property: 'I' },
      ],
    })

    expect(created).toMatchObject({ code: 'DS-02', title: 'Key leaked', item_definition_id: 'i-01', road_user_harm_description: null })
    expect((await api.content.children(project, 'i-01')).find((node) => node.id === 'a-04')?.children).toEqual([
      { type: 'damage-scenarios', id: created.id, code: 'DS-02', name: 'Key leaked' },
    ])
    expect((await api.content.assets(project, 'i-01')).find((asset) => asset.id === 'a-04')?.damageScenarios).toBe(1)
  })

  it('rejects a damage scenario linked to a property its asset does not have with 422', async () => {
    const api = createMockItemApi()

    await expect(
      api.damageScenarios.create(project, { item_definition_id: 'i-01', title: 'X', asset_properties: [{ asset_id: 'a-02', property: 'C' }] }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects a damage scenario linking the same asset property twice with 422', async () => {
    const api = createMockItemApi()
    const link = { asset_id: 'a-04', property: 'C' } as const

    await expect(api.damageScenarios.create(project, { item_definition_id: 'i-01', title: 'X', asset_properties: [link, link] })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('updates a damage scenario and renames it in the tree', async () => {
    const api = createMockItemApi()

    const updated = await api.damageScenarios.update(project, 'ds-01', { title: ' Low beam fails ' })

    expect(updated).toMatchObject({ code: 'DS-01', title: 'Low beam fails', item_definition_id: 'i-01' })
    expect((await api.content.children(project, 'i-01'))[0].children?.[0]).toMatchObject({ id: 'ds-01', name: 'Low beam fails' })
    await expect(api.damageScenarios.update(project, 'ds-01', { title: ' ' })).rejects.toMatchObject({ status: 422 })
  })

  it('returns 404 for unknown damage scenarios and those of deleted items', async () => {
    const api = createMockItemApi()

    await expect(api.damageScenarios.get(project, 'nope')).rejects.toMatchObject({ status: 404 })
    await expect(api.damageScenarios.get('other', 'ds-01')).rejects.toMatchObject({ status: 404 })
    await api.items.delete(project, 'i-01')
    await expect(api.damageScenarios.impactRatings(project, 'ds-01')).rejects.toMatchObject({ status: 404 })
  })

  it('replaces the impact rating per category and keeps the others', async () => {
    const api = createMockItemApi()
    const [safety] = await api.damageScenarios.impactRatings(project, 'ds-01')

    const ratings = await api.damageScenarios.updateImpactRatings(project, 'ds-01', [
      { impact_category: 'SAFETY', rating_value: 'MAJOR', is_omitted_by_pm_15_07: false, omission_or_rating_rationale: null, reused_from_functional_safety: false },
      { impact_category: 'FINANCIAL', rating_value: 'NEGLIGIBLE', is_omitted_by_pm_15_07: false, omission_or_rating_rationale: null, reused_from_functional_safety: false },
    ])

    expect(ratings.map((r) => [r.impact_category, r.rating_value])).toEqual([
      ['SAFETY', 'MAJOR'],
      ['OPERATIONAL', 'MODERATE'],
      ['PRIVACY', 'OMITTED'],
      ['FINANCIAL', 'NEGLIGIBLE'],
    ])
    expect(ratings[0].id).toBe(safety.id)
  })

  it.each([
    ['an inconsistent omission flag', { impact_category: 'PRIVACY', rating_value: 'OMITTED', is_omitted_by_pm_15_07: false, reused_from_functional_safety: false }],
    ['reuse from functional safety outside safety', { impact_category: 'FINANCIAL', rating_value: 'MAJOR', is_omitted_by_pm_15_07: false, reused_from_functional_safety: true }],
  ] as const)('rejects impact ratings with %s with 422', async (_, rating) => {
    const api = createMockItemApi()

    await expect(
      api.damageScenarios.updateImpactRatings(project, 'ds-01', [{ ...rating, omission_or_rating_rationale: null }]),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects two impact ratings of the same category with 422', async () => {
    const api = createMockItemApi()
    const rating = { impact_category: 'SAFETY', rating_value: null, is_omitted_by_pm_15_07: false, omission_or_rating_rationale: null, reused_from_functional_safety: false } as const

    await expect(api.damageScenarios.updateImpactRatings(project, 'ds-01', [rating, rating])).rejects.toMatchObject({ status: 422 })
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

  describe('damage scenario relations', () => {
    it('returns the linked assets with their properties and the linked threat scenarios', async () => {
      const relations = await createMockItemApi().damageScenarios.relations(project, 'ds-01')

      expect(relations.assets).toEqual([{ id: 'a-01', code: 'A-01', name: 'Headlamp on/off command', properties: ['I', 'A'], linkedProperties: ['I', 'A'] }])
      expect(relations.threatScenarios.map((threat) => threat.code)).toEqual(['TS-01'])
    })

    it('rejects links that the database constraints do not allow', async () => {
      const { damageScenarios } = createMockItemApi()

      await expect(damageScenarios.linkAsset(project, 'ds-01', 'nope', ['I'])).rejects.toMatchObject({ status: 404 })
      await expect(damageScenarios.linkAsset(project, 'ds-01', 'a-02', [])).rejects.toMatchObject({ status: 422 })
      await expect(damageScenarios.linkAsset(project, 'ds-01', 'a-02', ['C'])).rejects.toMatchObject({ status: 422 })
      await expect(damageScenarios.linkAsset(project, 'ds-01', 'a-01', ['I', 'I'])).rejects.toMatchObject({ status: 422 })
      await expect(damageScenarios.linkThreatScenario(project, 'ds-01', 'ts-01')).rejects.toMatchObject({ status: 409 })
      await expect(damageScenarios.linkThreatScenario(project, 'ds-01', 'nope')).rejects.toMatchObject({ status: 404 })
      await expect(damageScenarios.unlinkThreatScenario(project, 'ds-01', 'ts-02')).rejects.toMatchObject({ status: 404 })
      await expect(damageScenarios.unlinkAsset(project, 'ds-01', 'a-02')).rejects.toMatchObject({ status: 404 })
    })

    it('replaces the properties of an existing asset link', async () => {
      const { damageScenarios } = createMockItemApi()

      const relations = await damageScenarios.linkAsset(project, 'ds-01', 'a-01', ['A'])

      expect(relations.assets).toMatchObject([{ id: 'a-01', linkedProperties: ['A'] }])
    })

    it('moves the damage scenario with its threat scenarios between assets in the tree and updates the counters', async () => {
      const api = createMockItemApi()

      await api.damageScenarios.linkAsset(project, 'ds-01', 'a-02', ['I'])
      await api.damageScenarios.unlinkAsset(project, 'ds-01', 'a-01')

      expect(await treeBelow(api, 'a-01')).toBeUndefined()
      expect(await treeBelow(api, 'a-02')).toMatchObject([{ code: 'DS-01', children: [{ code: 'TS-01', children: [{ code: 'AP-01' }, { code: 'AP-02' }] }] }])
      const assets = await api.content.assets(project, 'i-01')
      expect(assets.find((a) => a.id === 'a-01')).toMatchObject({ damageScenarios: 0, threatScenarios: 0 })
      expect(assets.find((a) => a.id === 'a-02')).toMatchObject({ damageScenarios: 1, threatScenarios: 1 })
    })

    it('keeps the attack paths of a threat scenario when it is linked again', async () => {
      const api = createMockItemApi()

      await api.damageScenarios.unlinkThreatScenario(project, 'ds-01', 'ts-01')
      expect((await treeBelow(api, 'a-01'))![0].children).toBeUndefined()
      await api.damageScenarios.linkThreatScenario(project, 'ds-01', 'ts-01')

      expect((await treeBelow(api, 'a-01'))![0].children).toMatchObject([{ code: 'TS-01', children: [{ code: 'AP-01' }, { code: 'AP-02' }] }])
    })
  })
})
