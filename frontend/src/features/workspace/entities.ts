// Element types of the TARA hierarchy with their URL segment and tabs, as in the Concept 2 wireframes.
// The URLs are flat per type (not nested), because the relations are many-to-many: one threat
// scenario can belong to several damage scenarios, so it has no single parent path.

export type EntityType = 'items' | 'assets' | 'damage-scenarios' | 'threat-scenarios' | 'attack-paths'

/** One occurrence of an entity in the navigation hierarchy; relations can have several parents. */
export interface TreeNode {
  type: EntityType
  id: string
  code: string
  name: string
  children?: TreeNode[]
}

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

export function entityPath(projectId: string, type: EntityType, id: string) {
  return `/projects/${projectId}/${type}/${id}`
}
