import type { AttackFeasibility } from './attackPath'
import type { CiaProperty } from './asset'
import type { ImpactRating } from './damageScenario'
import type { EntityRef } from './tree'

// Threat scenarios and their links follow `THREAT_SCENARIO`, `THREAT_DAMAGE_LINK`, `THREAT_ATTACK_PATH_LINK`
// and `THREAT_SCENARIO_ASSET_PROPERTY` of the data model. Not in the backend spec yet.

export type ElicitationMethod = 'GROUP_DISCUSSION' | 'MALICIOUS_USE_CASE' | 'EVITA' | 'TVRA' | 'PASTA' | 'STRIDE' | 'OTHER'

export interface ThreatScenario {
  id: string
  item_definition_id: string
  /** Display ID such as TS-01; not in the DB schema yet (as for assets). */
  code: string
  title: string
  cause_of_compromise: string | null
  elicitation_method: ElicitationMethod | null
  technical_notes: string | null
}

/** PATCH body: only the given fields change. */
export type PatchThreatScenarioBody = Partial<Pick<ThreatScenario, 'title' | 'cause_of_compromise' | 'elicitation_method' | 'technical_notes'>>

/** Many-to-many link: a threat scenario can lead to several damage scenarios and the other way round. */
export interface ThreatDamageLink {
  threat_scenario_id: string
  damage_scenario_id: string
}

export interface ThreatAttackPathLink {
  threat_scenario_id: string
  attack_path_id: string
}

/** Asset property the threat scenario compromises [RQ-15-03]. */
export interface ThreatScenarioAssetProperty {
  threat_scenario_id: string
  asset_id: string
  property: CiaProperty
}

/** Asset property whose loss leads to a linked damage scenario, so the threat scenario can target it. */
export interface ThreatCause {
  asset: EntityRef
  property: CiaProperty
}

/** Asset property a threat scenario targets, in the views. */
export interface ThreatTarget {
  assetId: string
  property: CiaProperty
}

/** Linked elements of a threat scenario and its targets. */
export interface ThreatScenarioRelations {
  damageScenarios: (EntityRef & { causes: ThreatCause[] })[]
  attackPaths: EntityRef[]
  targets: ThreatTarget[]
}

/** What the risk values of a threat scenario are calculated from: the impact of its damage scenarios and its rated attack paths. */
export interface ThreatScenarioRiskInputs {
  damageScenarios: (EntityRef & {
    /** The threat's targets that lead to the damage scenario; empty if none does (RQ-15-03). */
    targetedCauses: ThreatCause[]
    impactRatings: Pick<ImpactRating, 'impact_category' | 'rating_value' | 'omission_or_rating_rationale'>[]
  })[]
  attackPaths: (EntityRef & { feasibility: AttackFeasibility | null; isPartial: boolean })[]
}
