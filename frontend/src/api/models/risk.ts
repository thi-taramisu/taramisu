import type { CiaProperty } from './asset'
import type { EntityRef } from './tree'

// Risk table of an item ("Item Summary" in the wireframe). Not in the backend spec yet.

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
