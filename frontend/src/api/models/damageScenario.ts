import type { components } from '../schema'
import type { CiaProperty } from './asset'
import type { EntityRef } from './tree'

type Schemas = components['schemas']

// View models normalize optional backend fields to null. Damage scenarios belong to one item;
// several asset properties can lead to a scenario. Relations resolve backend property IDs.

export type DamageScenario = Omit<Schemas['DamageScenarioBody'], 'functionality_adverse_relation' | 'road_user_harm_description'> & {
  /** Empty until the backend supplies a display code. */
  code: string
  functionality_adverse_relation: string | null
  road_user_harm_description: string | null
}

/** Asset property whose compromise leads to a damage scenario (`DAMAGE_SCENARIO_ASSET_PROPERTY`). */
export interface DamageScenarioAssetProperty {
  asset_id: string
  property: CiaProperty
}

/** POST body: title, owning item and the asset properties leading to the damage scenario. */
export type DamageScenarioBody = Pick<DamageScenario, 'item_definition_id' | 'title'> & {
  asset_properties: DamageScenarioAssetProperty[]
}

/** PATCH body: only the given fields change. */
export type PatchDamageScenarioBody = Schemas['UpdateDamageScenarioInputBody']

/** Asset linked to a damage scenario: `properties` are those of the asset, `linkedProperties` lead to the damage. */
export interface LinkedAsset extends EntityRef {
  properties: CiaProperty[]
  linkedProperties: CiaProperty[]
}

/** Content of the Relations tab. */
export interface DamageScenarioRelations {
  assets: LinkedAsset[]
  threatScenarios: EntityRef[]
}

export type ImpactCategory = Schemas['ImpactRatingFields']['impact_category']

export type ImpactRatingValue = NonNullable<Schemas['ImpactRatingFields']['rating_value']>

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
