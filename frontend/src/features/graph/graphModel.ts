import type { RiskGroup } from '../../api/models/risk'
import type { EntityType, TreeNode } from '../../api/models/tree'

export interface GraphElement {
  key: string
  id: string
  type: EntityType
  code?: string
  name: string
  risk: number | null
}
export interface GraphRelation {
  id: string
  source: string
  target: string
  risk: number | null
}
export interface RelationGraph {
  elements: GraphElement[]
  relations: GraphRelation[]
}
export const elementKey = (type: EntityType, id: string) => `${type}:${id}`

/** Merge repeated tree occurrences into entities; preserve every distinct relation. */
export function buildRelationGraph(items: { tree: TreeNode; risks: RiskGroup[] }[]): RelationGraph {
  const elements = new Map<string, GraphElement>()
  const relations = new Map<string, GraphRelation>()
  function add(node: Omit<GraphElement, 'key' | 'risk'>) {
    const key = elementKey(node.type, node.id)
    if (!elements.has(key)) elements.set(key, { ...node, key, risk: null })
    return key
  }
  function link(source: string, target: string, risk: number | null = null) {
    const id = `${source}->${target}`
    const previous = relations.get(id)?.risk
    relations.set(id, { id, source, target, risk: risk === null ? previous ?? null : Math.max(previous ?? 0, risk) })
  }
  function visit(node: TreeNode, parent: TreeNode | undefined, paths: Set<string>) {
    const key = add(node)
    if (node.type === 'attack-paths') paths.add(key)
    if (parent) {
      const parentKey = elementKey(parent.type, parent.id)
      // Attack paths lead to threats; threats lead to damage. The tree is ordered the other way.
      if (node.type === 'attack-paths' || node.type === 'threat-scenarios') link(key, parentKey)
      else link(parentKey, key)
    }
    node.children?.forEach((child) => visit(child, node, paths))
  }
  for (const { tree, risks } of items) {
    const itemPaths = new Set<string>()
    visit(tree, undefined, itemPaths)
    for (const group of risks) {
      const asset = add({ ...group.asset, type: 'assets' })
      for (const row of group.rows) {
        const threat = add({ ...row.threatScenario, type: 'threat-scenarios' })
        if (row.damageScenario) {
          const damage = add({ ...row.damageScenario, type: 'damage-scenarios' })
          link(asset, damage, row.risk)
          link(threat, damage, row.risk)
        }
        // Only the explicitly rated path receives this score; never infer scores from impact/feasibility alone.
        const path = [...elements.values()].find((el) => itemPaths.has(el.key) && el.code === row.feasibility?.attackPath)
        if (path) link(path.key, threat, row.risk)
      }
    }
  }
  for (const relation of relations.values()) {
    if (relation.risk === null) continue
    for (const key of [relation.source, relation.target]) {
      const element = elements.get(key)!
      element.risk = Math.max(element.risk ?? 0, relation.risk)
    }
  }
  return { elements: [...elements.values()], relations: [...relations.values()] }
}

/** One-hop relations around the active element, plus the owning asset as context for threats. */
export function graphNeighborhood(graph: RelationGraph, focus: string): RelationGraph {
  const keys = new Set([focus])
  for (const edge of graph.relations) {
    if (edge.source === focus) keys.add(edge.target)
    if (edge.target === focus) keys.add(edge.source)
  }
  if (graph.elements.find((element) => element.key === focus)?.type === 'threat-scenarios') {
    for (const edge of graph.relations) {
      if (keys.has(edge.target) && edge.source.startsWith('assets:')) keys.add(edge.source)
    }
  }
  return {
    elements: graph.elements.filter((element) => keys.has(element.key)),
    relations: graph.relations.filter((edge) => keys.has(edge.source) && keys.has(edge.target)),
  }
}
