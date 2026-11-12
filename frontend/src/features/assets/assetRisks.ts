import type { AssetRelations, CiaProperty } from '../../api/models/asset'
import type { ThreatScenarioRiskInputs } from '../../api/models/threatScenario'
import type { EntityRef } from '../../api/models/tree'
import { calculateRisks, type AggregatedFeasibility } from '../threat-scenarios/riskCalculation'

export interface AssetRiskRow {
  key: string
  damageScenario: EntityRef
  /** Properties of the asset whose loss leads to the damage scenario. */
  properties: CiaProperty[]
  /** Null if no threat scenario leads to the damage scenario yet. */
  threatScenario: EntityRef | null
  /** `targeted`: the threat attacks a property of this asset, `via damage`: it only leads to the same damage. */
  relation: 'targeted' | 'via damage' | null
  /** Null while the risk inputs of the threat scenario are not loaded. */
  feasibility: AggregatedFeasibility | null
  /** Highest risk value over the impact categories of the damage scenario. */
  risk: number | null
}

/**
 * Asset Risks tab ("Asset Summary" wireframe): one row per damage scenario × threat scenario of the asset,
 * with the risk calculated as on the threat scenario's Risks tab.
 */
export function assetRiskRows(relations: AssetRelations, riskInputs: Map<string, ThreatScenarioRiskInputs>): AssetRiskRow[] {
  const results = new Map([...riskInputs].map(([id, inputs]) => [id, calculateRisks(inputs)]))
  return relations.damageScenarios.flatMap(({ linkedProperties, ...damageScenario }): AssetRiskRow[] => {
    const threats = relations.threatScenarios.filter((ts) => ts.damageScenarioIds.includes(damageScenario.id))
    if (threats.length === 0) {
      return [{ key: damageScenario.id, damageScenario, properties: linkedProperties, threatScenario: null, relation: null, feasibility: null, risk: null }]
    }
    return threats.map(({ id, code, name, targetedProperties }) => {
      const threatScenario = { id, code, name }
      const result = results.get(threatScenario.id)
      return {
        key: `${damageScenario.id}/${threatScenario.id}`,
        damageScenario,
        properties: linkedProperties,
        threatScenario,
        relation: targetedProperties.some((p) => linkedProperties.includes(p)) ? 'targeted' : 'via damage',
        feasibility: result?.feasibility ?? null,
        risk: result?.groups.find((group) => group.damageScenario.id === damageScenario.id)?.max ?? null,
      }
    })
  })
}
