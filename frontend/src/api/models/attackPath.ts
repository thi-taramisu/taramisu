import type { EntityRef } from './tree'

// Attack paths follow `ATTACK_PATH`, `THREAT_ATTACK_PATH_LINK` and `ATTACK_FEASIBILITY_RATING` of the data model.
// Not in the backend spec yet.

export type AnalysisApproach = 'TOP_DOWN' | 'BOTTOM_UP'

/** One entry of the JSON column `attack_steps_and_weaknesses`, whose shape the data model leaves open. */
export interface AttackStep {
  description: string
}

export interface AttackPath {
  id: string
  item_definition_id: string
  /** Display ID such as AP-01; not in the DB schema yet (as for assets). */
  code: string
  title: string
  analysis_approach: AnalysisApproach | null
  is_partial_early_stage: boolean
  attack_steps_and_weaknesses: AttackStep[]
}

/** PATCH body: only the given fields change. */
export type PatchAttackPathBody = Partial<Pick<AttackPath, 'title' | 'analysis_approach' | 'is_partial_early_stage' | 'attack_steps_and_weaknesses'>>

export type AttackFeasibility = 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW'

/** Attack-potential-based rating of an attack path; at most one per attack path [RQ-15-10]. */
export interface AttackFeasibilityRating {
  id: string
  attack_path_id: string
  ap_elapsed_time: number | null
  ap_specialist_expertise: number | null
  ap_knowledge_of_item: number | null
  ap_window_of_opportunity: number | null
  ap_equipment: number | null
  /** Sum of the five factors; null until all of them are rated. */
  ap_total_score: number | null
  feasibility_rating: AttackFeasibility | null
  rationale: string | null
}

/** PUT body: replaces the stored rating. */
export type AttackFeasibilityRatingBody = Omit<AttackFeasibilityRating, 'id' | 'attack_path_id'>

export interface AttackPathRelations {
  threatScenarios: EntityRef[]
}
