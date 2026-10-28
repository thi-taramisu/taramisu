import type { TreeNode } from '../workspace/entities'

// Item API used by the item views. The shapes follow the `ItemDefinition` schema of the item CRUD
// routes (#83, PR #138), so the mock in `mockItemApi.ts` can be swapped for the generated
// openapi-fetch client (#118) without touching the components.

export type ScopeType = 'ITEM' | 'COMPONENT'

export interface ItemDefinition {
  id: string
  tara_project_id: string
  name: string
  scope_type: ScopeType
  lifecycle_phase: string | null
  item_definition_wp_09_01: string | null
  cybersecurity_specs_wp_10_01: string | null
  architectural_design: string | null
  // Fields of the Definition tab in the interactive wireframe; not in the DB schema yet, the
  // schema follows the UI here (see #94).
  boundary: string | null
  functions: string | null
  operational_environment: string | null
  created_at: string
}

type EditableFields = Omit<ItemDefinition, 'id' | 'tara_project_id' | 'created_at'>

/** POST body: name and scope type are required, everything else is optional. */
export type ItemDefinitionBody = Pick<EditableFields, 'name' | 'scope_type'> & Partial<EditableFields>

/** PATCH body: only the given fields change. */
export type PatchItemDefinitionBody = Partial<EditableFields>

export const ITEM_NAME_MAX_LENGTH = 255

export type CiaProperty = 'C' | 'I' | 'A'

export interface EntityRef {
  id: string
  code: string
  name: string
}

export interface ItemAsset extends EntityRef {
  component: string
  properties: CiaProperty[]
  damageScenarios: number
  threatScenarios: number
  /** Highest risk value of the related threat scenarios, null if nothing is rated. */
  maxRisk: number | null
}

export type NewAsset = Pick<ItemAsset, 'name' | 'component' | 'properties'>

export interface RiskRow {
  property: CiaProperty
  damageScenario: (EntityRef & { impact: string }) | null
  threatScenario: EntityRef
  /** `targeted`: the threat attacks this asset property, `via damage`: the damage arises from it. */
  relation: 'targeted' | 'via damage'
  feasibility: { rating: string; attackPath: string } | null
  risk: number | null
  treatment: string | null
}

export interface RiskGroup {
  asset: EntityRef & { properties: CiaProperty[] }
  rows: RiskRow[]
}

/** Error of every failed call; the openapi-fetch adapter has to throw it with the HTTP status. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

/** Retries failed queries like TanStack Query does by default, except for 404s. */
export function retryUnlessNotFound(failureCount: number, error: unknown) {
  return !isNotFound(error) && failureCount < 3
}

/**
 * CRUD of item definitions, 1:1 with `/projects/{project_id}/item-definitions`. Calls reject with an
 * `ApiError`, e.g. status 404 for unknown items and 422 for invalid bodies.
 */
export interface ItemService {
  list(projectId: string): Promise<ItemDefinition[]>
  get(projectId: string, itemId: string): Promise<ItemDefinition>
  create(projectId: string, body: ItemDefinitionBody): Promise<ItemDefinition>
  update(projectId: string, itemId: string, body: PatchItemDefinitionBody): Promise<ItemDefinition>
  delete(projectId: string, itemId: string): Promise<void>
}

/** What the item views show below an item. Mocked until the asset and risk endpoints exist. */
export interface ItemContentService {
  /** Elements below the item for the sidebar tree (assets, damage scenarios, ...). */
  children(projectId: string, itemId: string): Promise<TreeNode[]>
  assets(projectId: string, itemId: string): Promise<ItemAsset[]>
  addAsset(projectId: string, itemId: string, asset: NewAsset): Promise<ItemAsset>
  risks(projectId: string, itemId: string): Promise<RiskGroup[]>
}

export interface ItemApi {
  items: ItemService
  content: ItemContentService
}
