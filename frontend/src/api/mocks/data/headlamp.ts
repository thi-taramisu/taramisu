import type { ItemAsset } from '../../models/asset'
import type { ItemDefinition } from '../../models/item'
import type { RiskGroup } from '../../models/risk'
import type { TreeNode } from '../../models/tree'

// MOCK DATA: the headlamp system, the example project of the course. Seeds the mock item API and
// stands in for the project until the backend has project, asset and risk endpoints.

export const exampleProject = {
  id: 'headlamp',
  name: 'Headlamp system (example)',
  tree: [
    {
      type: 'items',
      id: 'i-01',
      code: 'I-01',
      name: 'Headlamp system',
      children: [
        {
          type: 'assets',
          id: 'a-01',
          code: 'A-01',
          name: 'Headlamp on/off command',
          children: [
            {
              type: 'damage-scenarios',
              id: 'ds-01',
              code: 'DS-01',
              name: 'Headlamp turns off while driving at night',
              children: [
                {
                  type: 'threat-scenarios',
                  id: 'ts-01',
                  code: 'TS-01',
                  name: 'Spoofed headlamp command on the CAN bus',
                  children: [
                    { type: 'attack-paths', id: 'ap-01', code: 'AP-01', name: 'Compromised navigation ECU via cellular' },
                    { type: 'attack-paths', id: 'ap-02', code: 'AP-02', name: 'Malicious device on the OBD-II connector' },
                  ],
                },
              ],
            },
          ],
        },
        { type: 'assets', id: 'a-02', code: 'A-02', name: 'Body control ECU firmware' },
        { type: 'assets', id: 'a-03', code: 'A-03', name: 'Camera image data' },
        { type: 'assets', id: 'a-04', code: 'A-04', name: 'Diagnostic session key' },
      ],
    },
  ] satisfies TreeNode[] as TreeNode[],
}

export const headlampItem: ItemDefinition = {
  id: 'i-01',
  tara_project_id: exampleProject.id,
  name: 'Headlamp system',
  scope_type: 'ITEM',
  lifecycle_phase: 'Concept',
  item_definition_wp_09_01: null,
  cybersecurity_specs_wp_10_01: null,
  architectural_design: null,
  boundary: 'Headlamp system incl. body control ECU, power switch actuator and lamps. Gateway ECU, camera ECU and navigation ECU are outside the boundary.',
  functions: 'Switch low and high beam on driver request; automatic high beam based on camera data.',
  operational_environment: 'Passenger car at day and night; vehicle CAN bus behind the gateway; workshop diagnostics via OBD-II.',
  created_at: '2026-10-01T08:00:00Z',
}

export const headlampAssets: ItemAsset[] = [
  { id: 'a-01', code: 'A-01', name: 'Headlamp on/off command', component: 'Body control ECU', properties: ['I', 'A'], damageScenarios: 1, threatScenarios: 1, maxRisk: 4 },
  { id: 'a-02', code: 'A-02', name: 'Body control ECU firmware', component: 'Body control ECU', properties: ['I'], damageScenarios: 0, threatScenarios: 0, maxRisk: null },
  { id: 'a-03', code: 'A-03', name: 'Camera image data', component: 'Camera ECU', properties: ['I', 'A'], damageScenarios: 0, threatScenarios: 0, maxRisk: null },
  { id: 'a-04', code: 'A-04', name: 'Diagnostic session key', component: 'Gateway ECU', properties: ['C', 'I'], damageScenarios: 0, threatScenarios: 0, maxRisk: null },
]

const ds01 = { id: 'ds-01', code: 'DS-01', name: 'Headlamp turns off while driving at night', impact: 'S·Sev' }
const ts01 = { id: 'ts-01', code: 'TS-01', name: 'Spoofed headlamp command on the CAN bus' }

export const headlampRisks: RiskGroup[] = [
  {
    asset: { id: 'a-01', code: 'A-01', name: 'Headlamp on/off command', properties: ['I', 'A'] },
    rows: [
      { property: 'I', damageScenario: ds01, threatScenario: ts01, relation: 'targeted', feasibility: { rating: 'Medium', attackPath: 'AP-02' }, risk: 4, treatment: 'Reduce' },
      { property: 'A', damageScenario: ds01, threatScenario: ts01, relation: 'via damage', feasibility: { rating: 'Medium', attackPath: 'AP-02' }, risk: 4, treatment: null },
    ],
  },
]
