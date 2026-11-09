import type { DamageScenario, DamageScenarioAssetProperty, ImpactRating } from '../../models/damageScenario'
import type { ThreatDamageLink, ThreatScenario } from '../../models/threatScenario'

// Example damage scenario of the headlamp system, seed data of the mock item API until the backend
// has damage scenario endpoints.

export const headlampDamageScenarios: DamageScenario[] = [
  {
    id: 'ds-01',
    item_definition_id: 'i-01',
    code: 'DS-01',
    title: 'Headlamp turns off while driving at night',
    functionality_adverse_relation: 'Loss of the low beam function while the vehicle is driven in the dark.',
    road_user_harm_description: 'The driver no longer sees the road; collision with other road users or obstacles.',
  },
]

export const headlampDamageScenarioLinks: (DamageScenarioAssetProperty & { damage_scenario_id: string })[] = [
  { damage_scenario_id: 'ds-01', asset_id: 'a-01', property: 'I' },
  { damage_scenario_id: 'ds-01', asset_id: 'a-01', property: 'A' },
]

// TS-02 and TS-03 have no links yet, so they can be added on the Relations tab.
export const headlampThreatScenarios: ThreatScenario[] = [
  { id: 'ts-01', item_definition_id: 'i-01', code: 'TS-01', title: 'Spoofed headlamp command on the CAN bus' },
  { id: 'ts-02', item_definition_id: 'i-01', code: 'TS-02', title: 'Replayed headlamp command on the CAN bus' },
  { id: 'ts-03', item_definition_id: 'i-01', code: 'TS-03', title: 'Denial of service on the body control ECU' },
]

export const headlampThreatDamageLinks: ThreatDamageLink[] = [{ threat_scenario_id: 'ts-01', damage_scenario_id: 'ds-01' }]

export const headlampImpactRatings: ImpactRating[] = [
  {
    id: 'ir-01',
    damage_scenario_id: 'ds-01',
    impact_category: 'SAFETY',
    rating_value: 'SEVERE',
    is_omitted_by_pm_15_07: false,
    omission_or_rating_rationale: 'Severity S3 from the HARA of the headlamp system.',
    reused_from_functional_safety: true,
  },
  {
    id: 'ir-02',
    damage_scenario_id: 'ds-01',
    impact_category: 'OPERATIONAL',
    rating_value: 'MODERATE',
    is_omitted_by_pm_15_07: false,
    omission_or_rating_rationale: 'The vehicle cannot be driven at night until repaired.',
    reused_from_functional_safety: false,
  },
  {
    id: 'ir-03',
    damage_scenario_id: 'ds-01',
    impact_category: 'PRIVACY',
    rating_value: 'OMITTED',
    is_omitted_by_pm_15_07: true,
    omission_or_rating_rationale: 'No personal data is involved.',
    reused_from_functional_safety: false,
  },
]
