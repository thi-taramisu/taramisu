import { describe, expect, it } from 'vitest'
import { buildRelationGraph, elementKey, graphNeighborhood } from './graphModel'
import type { TreeNode } from '../../api/models/tree'
import type { RiskGroup } from '../../api/models/risk'

const damage: TreeNode = { type: 'damage-scenarios', id: 'ds', code: 'DS-1', name: 'Damage', children: [
  { type: 'threat-scenarios', id: 'ts', code: 'TS-1', name: 'Threat', children: [
    { type: 'attack-paths', id: 'ap1', code: 'AP-1', name: 'Unrated path' },
    { type: 'attack-paths', id: 'ap2', code: 'AP-2', name: 'Rated path' },
  ] },
] }
const tree: TreeNode = { type: 'items', id: 'item', name: 'Item', children: [
  { type: 'assets', id: 'asset', name: 'Asset', children: [damage] },
  { type: 'assets', id: 'other', name: 'Other asset', children: [damage] },
] }
const risks: RiskGroup[] = [{ asset: { id: 'asset', code: 'AS-1', name: 'Asset', properties: ['I'] }, rows: [{
  property: 'I', damageScenario: { id: 'ds', code: 'DS-1', name: 'Damage', impact: 'Severe' },
  threatScenario: { id: 'ts', code: 'TS-1', name: 'Threat' }, relation: 'targeted',
  feasibility: { rating: 'Medium', attackPath: 'AP-2' }, risk: 4, treatment: null,
}] }]

describe('relation graph', () => {
  it('deduplicates shared elements but preserves both asset links', () => {
    const graph = buildRelationGraph([{ tree, risks }])
    expect(graph.elements.filter((el) => el.id === 'ds')).toHaveLength(1)
    expect(graph.relations.filter((el) => el.target === 'damage-scenarios:ds' && el.source.startsWith('assets:'))).toHaveLength(2)
  })
  it('directs attack paths to threats and threats to damage', () => {
    const graph = buildRelationGraph([{ tree, risks }])
    expect(graph.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'attack-paths:ap2', target: 'threat-scenarios:ts', risk: 4 }),
      expect.objectContaining({ source: 'threat-scenarios:ts', target: 'damage-scenarios:ds', risk: 4 }),
    ]))
  })
  it('never assigns a rated path score to an unassessed sibling', () => {
    const graph = buildRelationGraph([{ tree, risks }])
    expect(graph.elements.find((el) => el.id === 'ap1')?.risk).toBeNull()
    expect(graph.relations.find((el) => el.source === 'attack-paths:ap1')?.risk).toBeNull()
    expect(graph.elements.find((el) => el.id === 'ap2')?.risk).toBe(4)
  })
  it('uses the highest recorded score rather than inventing a risk matrix', () => {
    const group = structuredClone(risks[0])
    group.rows.push({ ...group.rows[0], property: 'A', risk: 5 })
    expect(buildRelationGraph([{ tree, risks: [group] }]).elements.find((el) => el.id === 'ts')?.risk).toBe(5)
  })
  it('does not resolve a path code against an unrelated item', () => {
    const otherTree: TreeNode = { type: 'items', id: 'second-item', name: 'Second item', children: [] }
    const otherGroup = structuredClone(risks[0])
    otherGroup.asset.id = 'second-asset'
    otherGroup.rows[0].threatScenario = { id: 'second-threat', code: 'TS-2', name: 'Other threat' }
    const graph = buildRelationGraph([{ tree, risks: [] }, { tree: otherTree, risks: [otherGroup] }])
    expect(graph.elements.find((el) => el.id === 'ap2')?.risk).toBeNull()
    expect(graph.relations.some((edge) => edge.source === 'attack-paths:ap2' && edge.target === 'threat-scenarios:second-threat')).toBe(false)
  })
  it('includes unassigned elements with the elements below them but without a relation to the item', () => {
    const item: TreeNode = { type: 'items', id: 'item', name: 'Item', children: [], unassigned: [damage] }
    const graph = buildRelationGraph([{ tree: item, risks: [] }])
    expect(graph.elements.map((el) => el.id).toSorted()).toEqual(['ap1', 'ap2', 'ds', 'item', 'ts'])
    expect(graph.relations.map((edge) => edge.id).toSorted()).toEqual([
      'attack-paths:ap1->threat-scenarios:ts',
      'attack-paths:ap2->threat-scenarios:ts',
      'threat-scenarios:ts->damage-scenarios:ds',
    ])
  })
  it('does not relate an unassigned attack path to the threat its old risk row names', () => {
    const unlinked: TreeNode = { type: 'attack-paths', id: 'ap2', code: 'AP-2', name: 'Rated path' }
    const item: TreeNode = { type: 'items', id: 'item', name: 'Item', children: [
      { type: 'assets', id: 'asset', name: 'Asset', children: [{ ...damage, children: [{ type: 'threat-scenarios', id: 'ts', code: 'TS-1', name: 'Threat' }] }] },
    ], unassigned: [unlinked] }
    const graph = buildRelationGraph([{ tree: item, risks }])
    expect(graph.elements.find((el) => el.id === 'ap2')?.risk).toBeNull()
    expect(graph.relations.some((edge) => edge.source === 'attack-paths:ap2')).toBe(false)
  })
  it('shows neighbors and asset context, and supports moving to another focus', () => {
    const graph = buildRelationGraph([{ tree, risks }])
    const threat = graphNeighborhood(graph, elementKey('threat-scenarios', 'ts'))
    expect(threat.elements.map((el) => el.id)).toEqual(expect.arrayContaining(['ts', 'ap1', 'ap2', 'ds', 'asset', 'other']))
    expect(threat.elements.some((el) => el.id === 'item')).toBe(false)
    expect(graphNeighborhood(graph, 'attack-paths:ap2').elements.map((el) => el.id).toSorted()).toEqual(['ap2', 'ts'])
    expect(graphNeighborhood(graph, 'unknown').elements).toEqual([])
  })
})
