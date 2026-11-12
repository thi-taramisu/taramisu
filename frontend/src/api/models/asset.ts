import type { EntityRef } from './tree'

// Assets follow `ASSET` and `ASSET_CYBERSECURITY_PROPERTY` of the data model. The views still use the
// mock item API; the asset routes (#84) and property routes (#160) are not wired up yet.

export type CiaProperty = 'C' | 'I' | 'A'

/** Asset rows of the item views. */
export interface ItemAsset extends EntityRef {
  component: string
  properties: CiaProperty[]
  damageScenarios: number
  threatScenarios: number
  /** Highest risk value of the related threat scenarios, null if nothing is rated. */
  maxRisk: number | null
}

export type NewAsset = Pick<ItemAsset, 'name' | 'component' | 'properties'>

/** How the asset was identified (15.3.2 NOTE 2). */
export type IdentificationSource = 'ITEM_DEF' | 'IMPACT_RATING' | 'THREAT_DERIVED' | 'CATALOGUE'

/** Cybersecurity property of an asset [RQ-15-02] with its context on the asset [WP-15-02]. */
export interface AssetProperty {
  property: CiaProperty
  description: string | null
}

export interface Asset {
  id: string
  item_definition_id: string
  /** Display ID such as A-01; not in the DB schema yet. */
  code: string
  name: string
  description: string | null
  identification_source: IdentificationSource | null
  /** Declared properties, in C / I / A order. */
  properties: AssetProperty[]
}

/** PATCH body: only the given fields change; `properties` replaces all declared properties. */
export type PatchAssetBody = Partial<Pick<Asset, 'name' | 'description' | 'identification_source' | 'properties'>>

/** Linked elements of an asset. Threat scenarios reach an asset only through its damage scenarios. */
export interface AssetRelations {
  /** Damage scenarios that the loss of a property of this asset leads to (RQ-15-02). */
  damageScenarios: (EntityRef & { linkedProperties: CiaProperty[] })[]
  /** Threat scenarios linked to those damage scenarios. */
  threatScenarios: (EntityRef & {
    /** Properties of this asset the threat scenario targets (RQ-15-03); empty if it affects the asset only via damage. */
    targetedProperties: CiaProperty[]
    /** The damage scenarios of this asset it leads to. */
    damageScenarioIds: string[]
  })[]
}
