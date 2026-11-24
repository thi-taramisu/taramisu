import type { AttackFeasibility } from './attackPath'
import type { CiaProperty } from './asset'
import type { ImpactRating } from './damageScenario'
import type { EntityRef } from './tree'
import type { components } from '../schema'

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

/** POST body: title, owning item and the damage scenarios the threat scenario leads to; the other fields follow on its page. */
export type ThreatScenarioBody = Pick<ThreatScenario, 'item_definition_id' | 'title'> & {
  damage_scenario_ids: string[]
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

/** Risk value of a threat scenario for one impact rating, as `GET /threat-scenarios/{id}/risk-values` returns it. */
export type RiskValue = components['schemas']['RiskValue']

/**
 * Risks of a threat scenario as the backend calculates them, with the ratings they are calculated from.
 * Only `riskValues` is in the backend spec yet.
 */
export interface ThreatScenarioRisks {
  damageScenarios: (EntityRef & {
    /** The threat's targets that lead to the damage scenario; empty if none does (RQ-15-03). */
    targetedCauses: ThreatCause[]
    impactRatings: Pick<ImpactRating, 'id' | 'impact_category' | 'rating_value'>[]
  })[]
  attackPaths: (EntityRef & { feasibility: AttackFeasibility | null; isPartial: boolean })[]
  /** Aggregated attack feasibility: that of the most feasible rated attack path (15.8.2 NOTE 2); null while none is rated. */
  feasibility: { rating: AttackFeasibility; attackPathId: string } | null
  /** One per rated impact rating of a linked damage scenario once the feasibility is known [RQ-15-15]. */
  riskValues: RiskValue[]
}
