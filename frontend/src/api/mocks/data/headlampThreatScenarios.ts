import type { AttackFeasibilityRating, AttackPath } from '../../models/attackPath'
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
  {
    id: 'ap-01',
    item_definition_id: 'i-01',
    code: 'AP-01',
    title: 'Compromised navigation ECU via cellular',
    analysis_approach: 'TOP_DOWN',
    is_partial_early_stage: false,
    attack_steps_and_weaknesses: [
      { description: 'Compromise the navigation ECU via its cellular connection.' },
      { description: 'Send headlamp commands from the navigation ECU through the gateway.' },
      { description: 'The body control ECU switches off the low beam.' },
    ],
  },
  {
    id: 'ap-02',
    item_definition_id: 'i-01',
    code: 'AP-02',
    title: 'Malicious device on the OBD-II connector',
    analysis_approach: 'TOP_DOWN',
    is_partial_early_stage: false,
    attack_steps_and_weaknesses: [
      { description: 'Plug a malicious device into the OBD-II connector.' },
      { description: 'Send spoofed headlamp commands on the CAN bus.' },
    ],
  },
  { id: 'ap-03', item_definition_id: 'i-01', code: 'AP-03', title: 'Manipulated firmware update in the workshop', analysis_approach: null, is_partial_early_stage: true, attack_steps_and_weaknesses: [] },
]

// AP-03 is not rated yet; AP-02 stays the decisive path of the example risk table.
export const headlampAttackFeasibilityRatings: AttackFeasibilityRating[] = [
  {
    id: 'afr-01',
    attack_path_id: 'ap-01',
    ap_elapsed_time: 17,
    ap_specialist_expertise: 3,
    ap_knowledge_of_item: 0,
    ap_window_of_opportunity: 1,
    ap_equipment: 0,
    ap_total_score: 21,
    feasibility_rating: 'LOW',
    rationale: 'Finding a remote entry point takes months.',
  },
  {
    id: 'afr-02',
    attack_path_id: 'ap-02',
    ap_elapsed_time: 4,
    ap_specialist_expertise: 6,
    ap_knowledge_of_item: 3,
    ap_window_of_opportunity: 1,
    ap_equipment: 0,
    ap_total_score: 14,
    feasibility_rating: 'MEDIUM',
    rationale: null,
  },
]

export const headlampThreatAttackPathLinks: ThreatAttackPathLink[] = [
  { threat_scenario_id: 'ts-01', attack_path_id: 'ap-01' },
  { threat_scenario_id: 'ts-01', attack_path_id: 'ap-02' },
]
