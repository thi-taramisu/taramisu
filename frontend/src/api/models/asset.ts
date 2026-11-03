import type { EntityRef } from './tree'

// Asset rows of the item views. Not in the backend spec yet (assets CRUD, #84).

export type CiaProperty = 'C' | 'I' | 'A'

export interface ItemAsset extends EntityRef {
  component: string
  properties: CiaProperty[]
  damageScenarios: number
  threatScenarios: number
  /** Highest risk value of the related threat scenarios, null if nothing is rated. */
  maxRisk: number | null
}

export type NewAsset = Pick<ItemAsset, 'name' | 'component' | 'properties'>
