// Damage scenarios follow `DAMAGE_SCENARIO` and `IMPACT_RATING` of the data model. A damage scenario
// belongs to one item; several assets can lead to it. Not in the backend spec yet.

export interface DamageScenario {
  id: string
  item_definition_id: string
  /** Display ID such as DS-01; not in the DB schema yet (as for assets). */
  code: string
  title: string
  functionality_adverse_relation: string | null
  road_user_harm_description: string | null
}

/** PATCH body: only the given fields change. */
export type PatchDamageScenarioBody = Partial<Pick<DamageScenario, 'title' | 'functionality_adverse_relation' | 'road_user_harm_description'>>

export type ImpactCategory = 'SAFETY' | 'FINANCIAL' | 'OPERATIONAL' | 'PRIVACY'

export type ImpactRatingValue = 'SEVERE' | 'MAJOR' | 'MODERATE' | 'NEGLIGIBLE' | 'OMITTED'

export interface ImpactRating {
  id: string
  damage_scenario_id: string
  impact_category: ImpactCategory
  /** Null while the category is not rated. */
  rating_value: ImpactRatingValue | null
  /** True exactly when the rating is OMITTED [PM-15-07]. */
  is_omitted_by_pm_15_07: boolean
  omission_or_rating_rationale: string | null
  /** Only allowed for SAFETY. */
  reused_from_functional_safety: boolean
}

/** PUT body: the rating of one category, replacing the stored one. */
export type ImpactRatingBody = Omit<ImpactRating, 'id' | 'damage_scenario_id'>
