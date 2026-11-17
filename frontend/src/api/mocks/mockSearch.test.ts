import { describe, expect, it } from 'vitest'
import type { SearchRequest } from '../models/search'
import { createMockItemApi } from './mockItemApi'
import { createMockProjectApi } from './mockProjectApi'
import { mockProjects } from './data/projects'

const request: SearchRequest = { query: '', projectIds: [], types: [], offset: 0 }
const options = () => ({ signal: new AbortController().signal })

describe('mock global search', () => {
  it('finds every entity type and includes the name, ID, type, project and item', async () => {
    const api = createMockItemApi()
    const page = await api.search.search(request, options())
    expect(new Set(page.results.map((result) => result.type))).toEqual(new Set([
      'projects', 'items', 'assets', 'damage-scenarios', 'threat-scenarios', 'attack-paths',
    ]))
    const threat = page.results.find((result) => result.code === 'TS-01')!
    expect(threat).toMatchObject({
      id: 'ts-01', name: 'Spoofed headlamp command on the CAN bus', type: 'threat-scenarios',
      project: { id: 'headlamp', name: 'Headlamp System' }, item: { id: 'i-01', name: 'Headlamp system' },
    })
    expect(page.results.filter((result) => result.id === 'ts-01')).toHaveLength(1)
  })

  it.each(['ts-01', 'TS-01', 'ts-01 spoofed', '  SPOOFED   HEADLAMP  '])('matches display IDs and names case-insensitively: %s', async (query) => {
    const { search } = createMockItemApi()
    expect((await search.search({ ...request, query }, options())).results.map((result) => result.id)).toEqual(['ts-01'])
  })

  it('combines project and type filters; multiple types are ORed', async () => {
    const { search } = createMockItemApi()
    const page = await search.search({ ...request, projectIds: ['headlamp'], types: ['projects', 'assets'] }, options())
    expect(page.results).toHaveLength(5)
    expect(page.results.every((result) => result.project.id === 'headlamp' && ['projects', 'assets'].includes(result.type))).toBe(true)
  })

  it('never searches inaccessible projects, even when requested explicitly', async () => {
    const projects = createMockProjectApi(mockProjects.filter((project) => project.id === 'battery-security'))
    const api = createMockItemApi(projects)
    const all = await api.search.search(request, options())
    expect(all.results.map((result) => result.id)).toEqual(['battery-security'])
    expect((await api.search.search({ ...request, projectIds: ['headlamp'] }, options())).results).toEqual([])
  })

  it('reads live creations, renames and deletions, including elements outside the tree', async () => {
    const api = createMockItemApi()
    const item = await api.items.create('headlamp', { name: 'Powertrain', scope_type: 'ITEM' })
    const asset = await api.content.addAsset('headlamp', item.id, { name: 'Firmware', component: '', properties: [] })
    const damage = await api.damageScenarios.create('headlamp', { item_definition_id: item.id, title: 'Unlinked damage', asset_properties: [] })
    expect((await api.search.search({ ...request, query: 'unlinked' }, options())).results.map((result) => result.id)).toEqual([damage.id])
    await api.items.update('headlamp', item.id, { name: 'Power unit' })
    expect((await api.search.search({ ...request, query: 'power unit' }, options())).results.map((result) => result.id)).toEqual([item.id])
    expect((await api.search.search({ ...request, query: asset.id }, options())).results[0].item?.name).toBe('Power unit')
    await api.items.delete('headlamp', item.id)
    expect((await api.search.search({ ...request, query: asset.id }, options())).results).toEqual([])
    const project = await api.projects.create({ name: 'New search project' })
    expect((await api.search.search({ ...request, query: project.id }, options())).results[0].name).toBe(project.name)
    await api.projects.delete(project.id)
    expect((await api.search.search({ ...request, query: project.id }, options())).results).toEqual([])
  })

  it('paginates without dropping or repeating matches', async () => {
    const api = createMockItemApi()
    for (let i = 0; i < 25; i++) await api.items.create('headlamp', { name: `Paging ${String(i).padStart(2, '0')}`, scope_type: 'ITEM' })
    const first = await api.search.search({ ...request, query: 'Paging', types: ['items'] }, options())
    expect(first.results).toHaveLength(20)
    expect(first.total).toBe(25)
    const second = await api.search.search({ ...request, query: 'Paging', types: ['items'], offset: first.nextOffset! }, options())
    expect(second.results).toHaveLength(5)
    expect(second.nextOffset).toBeNull()
    expect(new Set([...first.results, ...second.results].map((result) => result.id)).size).toBe(25)
  })

  it('indexes saved threat scenario and attack path titles from their detail services', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.update('headlamp', 'ts-01', { title: 'Renamed threat' })
    await api.attackPaths.update('headlamp', 'ap-01', { title: 'Renamed attack path' })

    const page = await api.search.search({ ...request, query: 'Renamed' }, options())
    expect(page.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'ts-01', type: 'threat-scenarios', name: 'Renamed threat' }),
      expect.objectContaining({ id: 'ap-01', type: 'attack-paths', name: 'Renamed attack path' }),
    ]))
    expect(page.total).toBe(2)
  })

  it('honors cancellation before and after the project lookup', async () => {
    const api = createMockItemApi()
    const controller = new AbortController()
    const pending = api.search.search(request, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(api.search.search(request, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('propagates permission lookup failures instead of falling back to an unscoped index', async () => {
    const api = createMockItemApi()
    api.projects.list = async () => { throw new Error('Unavailable') }
    await expect(api.search.search(request, options())).rejects.toThrow('Unavailable')
  })
})
