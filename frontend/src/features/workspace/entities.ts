import type { EntityType, TreeNode } from '../../api/models/tree'

// Element types of the TARA hierarchy with their URL segment and tabs, as in the Concept 2 wireframes.
// The URLs are flat per type (not nested), because the relations are many-to-many: one threat
// scenario can belong to several damage scenarios, so it has no single parent path.

export interface EntityTab {
  /** Path segment below the entity URL, '' is the index tab. */
  path: string
  label: string
}

function tabs(...labels: string[]): EntityTab[] {
  return labels.map((label, i) => ({ path: i === 0 ? '' : label.toLowerCase(), label }))
}

export const ENTITY_TYPES: Record<EntityType, { label: string; tabs: EntityTab[] }> = {
  items: { label: 'Item', tabs: tabs('Definition', 'Assets', 'Risks', 'Review') },
  assets: { label: 'Asset', tabs: tabs('Definition', 'Risks', 'Relations') },
  'damage-scenarios': { label: 'Damage scenario', tabs: tabs('Definition', 'Impact', 'Relations') },
  'threat-scenarios': { label: 'Threat scenario', tabs: tabs('Definition', 'Risks', 'Treatment', 'Relations') },
  'attack-paths': { label: 'Attack path', tabs: tabs('Definition', 'Rating', 'Relations') },
}

/** Code and name for the hierarchy's accessible names, e.g. "AS-1 Firmware"; the visible tree label shows the name only. */
export function entityTitle({ code, name }: Pick<TreeNode, 'code' | 'name'>) {
  return code ? `${formatEntityId(code)} ${name}` : name
}

/** Display IDs retain their agreed type prefix and have no padding. */
export function formatEntityId(code: string): string
export function formatEntityId(code: string | undefined): string | undefined
export function formatEntityId(code: string | undefined) {
  if (code === undefined) return undefined
  const match = /^(AS|DS|TS|AP|IT)-?(\d+)$/.exec(code)
  if (!match) return code
  return `${match[1]}-${match[2].replace(/^0+(?=\d)/, '')}`
}

export function entityPath(projectId: string, type: EntityType, id: string) {
  return `/projects/${projectId}/${type}/${id}`
}

/** Everything the tree shows below a node: its children and, for items, the "Unassigned" section. */
export function nodesBelow(node: TreeNode): TreeNode[] {
  return [...(node.children ?? []), ...(node.unassigned ?? [])]
}

/** First occurrence of the entity in the tree, depth-first. */
export function findNode(type: EntityType, id: string, nodes: TreeNode[]): TreeNode | undefined {
  return findNodePath(type, id, nodes)?.at(-1)
}

/** First matching relation path, consistent with findNode for shared entities. */
export function findNodePath(type: EntityType, id: string, nodes: TreeNode[]): TreeNode[] | undefined {
  for (const node of nodes) {
    if (node.type === type && node.id === id) return [node]
    const path = findNodePath(type, id, nodesBelow(node))
    if (path) return [node, ...path]
  }
  return undefined
}
