import type { ItemAsset, NewAsset } from '../models/asset'
import type { ItemDefinition, ItemDefinitionBody, PatchItemDefinitionBody } from '../models/item'
import type { RiskGroup } from '../models/risk'
import type { TreeNode } from '../models/tree'

// Services of the item views. Only the mock in `../mocks/mockItemApi.ts` implements them so far; the
// real implementation wraps the openapi-fetch client once the routes are in `backend/openapi.json`.

/**
 * CRUD of item definitions, 1:1 with `/projects/{project_id}/item-definitions` (#83). Calls reject
 * with an `ApiError`, e.g. status 404 for unknown items and 422 for invalid bodies.
 */
export interface ItemService {
  list(projectId: string): Promise<ItemDefinition[]>
  get(projectId: string, itemId: string): Promise<ItemDefinition>
  create(projectId: string, body: ItemDefinitionBody): Promise<ItemDefinition>
  update(projectId: string, itemId: string, body: PatchItemDefinitionBody): Promise<ItemDefinition>
  delete(projectId: string, itemId: string): Promise<void>
}

/** What the item views show below an item, until the asset and risk endpoints exist. */
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
