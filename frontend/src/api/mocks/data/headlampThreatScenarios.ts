import type { AttackPath } from '../../models/attackPath'
import type { ThreatAttackPathLink, ThreatDamageLink, ThreatScenario, ThreatScenarioAssetProperty } from '../../models/threatScenario'

// Example threat scenarios and attack paths of the headlamp system, seed data of the mock item API
// until the backend has their endpoints.

// TS-02 and TS-03 have no links yet, so they can be added on the Relations tab.
export const headlampThreatScenarios: ThreatScenario[] = [
  { id: 'ts-01', item_definition_id: 'i-01', code: 'TS-01', title: 'Spoofed headlamp command on the CAN bus', cause_of_compromise: 'Spoofing of CAN messages', elicitation_method: 'STRIDE', technical_notes: 'Needs access to the vehicle CAN bus behind the gateway.' },
  { id: 'ts-02', item_definition_id: 'i-01', code: 'TS-02', title: 'Replayed headlamp command on the CAN bus', cause_of_compromise: null, elicitation_method: null, technical_notes: null },
  { id: 'ts-03', item_definition_id: 'i-01', code: 'TS-03', title: 'Denial of service on the body control ECU', cause_of_compromise: null, elicitation_method: null, technical_notes: null },
]

export const headlampThreatDamageLinks: ThreatDamageLink[] = [{ threat_scenario_id: 'ts-01', damage_scenario_id: 'ds-01' }]

export const headlampThreatTargets: ThreatScenarioAssetProperty[] = [{ threat_scenario_id: 'ts-01', asset_id: 'a-01', property: 'I' }]

export const headlampAttackPaths: AttackPath[] = [
  { id: 'ap-01', item_definition_id: 'i-01', code: 'AP-01', title: 'Compromised navigation ECU via cellular' },
  { id: 'ap-02', item_definition_id: 'i-01', code: 'AP-02', title: 'Malicious device on the OBD-II connector' },
  { id: 'ap-03', item_definition_id: 'i-01', code: 'AP-03', title: 'Manipulated firmware update in the workshop' },
]

export const headlampThreatAttackPathLinks: ThreatAttackPathLink[] = [
  { threat_scenario_id: 'ts-01', attack_path_id: 'ap-01' },
  { threat_scenario_id: 'ts-01', attack_path_id: 'ap-02' },
]
