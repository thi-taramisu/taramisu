// Threat scenarios as far as the relation views need them; they follow `THREAT_SCENARIO` and
// `THREAT_DAMAGE_LINK` of the data model. Not in the backend spec yet.

export interface ThreatScenario {
  id: string
  item_definition_id: string
  /** Display ID such as TS-01; not in the DB schema yet (as for assets). */
  code: string
  title: string
}

/** Many-to-many link: a threat scenario can lead to several damage scenarios and the other way round. */
export interface ThreatDamageLink {
  threat_scenario_id: string
  damage_scenario_id: string
}
