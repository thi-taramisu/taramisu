// Elements of the TARA hierarchy as the sidebar tree shows them. Not in the backend spec yet; the
// tree is assembled from the mock item API until the asset and scenario endpoints exist.

export type EntityType = 'items' | 'assets' | 'damage-scenarios' | 'threat-scenarios' | 'attack-paths'

/** One occurrence of an entity in the navigation hierarchy; relations can have several parents. */
export interface TreeNode {
  type: EntityType
  id: string
  /** Display ID such as A-01; items have none (interactive wireframe). */
  code?: string
  name: string
  children?: TreeNode[]
}

/** Reference to an element with its display ID, e.g. in the asset and risk tables. */
export interface EntityRef {
  id: string
  code: string
  name: string
}
