import type { ItemAsset, RiskGroup } from '../items/itemApi'

// Example assets and risks of the headlamp system, seed data of the mock item API until the
// backend has asset and risk endpoints.

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
