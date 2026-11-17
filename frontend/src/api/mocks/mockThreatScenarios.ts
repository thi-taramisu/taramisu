import { ApiError } from '../errors'
import type { AttackFeasibility } from '../models/attackPath'
import type { RiskValue, ThreatScenarioRelations, ThreatScenarioRisks } from '../models/threatScenario'
import { FEASIBILITY_ORDER, RISK_MATRIX } from '../riskMatrix'
import type { ThreatScenarioService } from '../services/threatScenarios'
import {
  addThreatAttackPathLink,
  addThreatDamageLink,
  isThreatCause,
  removeThreatAttackPathLink,
  removeThreatDamageLink,
  renameNodes,
  run,
  titleRef,
  validateTitle,
  type StoredItem,
} from './mockStore'

function relationsOf(entry: StoredItem, threatScenarioId: string): ThreatScenarioRelations {
  return {
    damageScenarios: entry.damageScenarios
      .filter((ds) => entry.threatDamageLinks.some((link) => link.threat_scenario_id === threatScenarioId && link.damage_scenario_id === ds.id))
      .map((ds) => ({
        ...titleRef(ds),
        causes: entry.damageScenarioLinks
          .filter((link) => link.damage_scenario_id === ds.id)
          .flatMap((link) => {
            const asset = entry.assets.find((a) => a.id === link.asset_id)
            return asset ? [{ asset: { id: asset.id, code: asset.code, name: asset.name }, property: link.property }] : []
          }),
      })),
    attackPaths: entry.attackPaths
      .filter((path) => entry.threatAttackPathLinks.some((link) => link.threat_scenario_id === threatScenarioId && link.attack_path_id === path.id))
      .map(titleRef),
    targets: entry.threatTargets
      .filter((target) => target.threat_scenario_id === threatScenarioId)
      .map((target) => ({ assetId: target.asset_id, property: target.property })),
  }
}

/** The most feasible rated attack path decides the feasibility of the threat scenario (15.8.2 NOTE 2); the first one on a tie. */
function aggregateFeasibility(attackPaths: ThreatScenarioRisks['attackPaths']): ThreatScenarioRisks['feasibility'] {
  let aggregated: ThreatScenarioRisks['feasibility'] = null
  for (const { id, feasibility } of attackPaths) {
    if (feasibility && (!aggregated || FEASIBILITY_ORDER.indexOf(feasibility) > FEASIBILITY_ORDER.indexOf(aggregated.rating))) {
      aggregated = { rating: feasibility, attackPathId: id }
    }
  }
  return aggregated
}

/**
 * One risk value per rated impact rating of the linked damage scenarios, looked up in the risk matrix [RQ-15-15].
 * The backend would recalculate on rating changes; the mock does it on read and keeps the ids of the stored values.
 */
function updateRiskValues(
  entry: StoredItem,
  threatScenarioId: string,
  damageScenarios: ThreatScenarioRisks['damageScenarios'],
  feasibility: AttackFeasibility | undefined,
): RiskValue[] {
  const values = damageScenarios.flatMap(({ impactRatings }) =>
    impactRatings.flatMap(({ id, rating_value }) => {
      if (!feasibility || !rating_value || rating_value === 'OMITTED') return []
      const stored = entry.riskValues.find((value) => value.threat_scenario_id === threatScenarioId && value.impact_rating_id === id)
      return [
        {
          id: stored?.id ?? crypto.randomUUID(),
          threat_scenario_id: threatScenarioId,
          impact_rating_id: id,
          risk_score: RISK_MATRIX[rating_value][feasibility],
          determination_method: 'RISK_MATRIX' as const,
        },
      ]
    }),
  )
  entry.riskValues = [...entry.riskValues.filter((value) => value.threat_scenario_id !== threatScenarioId), ...values]
  return values
}

/** MOCK: threat scenario service on the stored data of the in-memory item API. */
export function createMockThreatScenarioService(db: Map<string, StoredItem>): ThreatScenarioService {
  function findThreatScenario(projectId: string, threatScenarioId: string) {
    for (const entry of db.values()) {
      const scenario = entry.threatScenarios.find((ts) => ts.id === threatScenarioId)
      if (scenario && entry.item.tara_project_id === projectId) return { entry, scenario }
    }
    throw new ApiError(404, 'Threat scenario not found.')
  }

  return {
    get: (projectId, threatScenarioId) => run(() => findThreatScenario(projectId, threatScenarioId).scenario),
    update: (projectId, threatScenarioId, body) =>
      run(() => {
        const { entry, scenario } = findThreatScenario(projectId, threatScenarioId)
        const title = validateTitle(body.title)
        Object.assign(scenario, body, title === undefined ? {} : { title })
        renameNodes(entry.children, { type: 'threat-scenarios', id: scenario.id, name: scenario.title })
        return scenario
      }),
    relations: (projectId, threatScenarioId) =>
      run(() => {
        const { entry, scenario } = findThreatScenario(projectId, threatScenarioId)
        return relationsOf(entry, scenario.id)
      }),
    risks: (projectId, threatScenarioId) =>
      run((): ThreatScenarioRisks => {
        const { entry, scenario } = findThreatScenario(projectId, threatScenarioId)
        const relations = relationsOf(entry, scenario.id)
        const damageScenarios = relations.damageScenarios.map(({ id, code, name, causes }) => ({
          id,
          code,
          name,
          targetedCauses: causes.filter((cause) => relations.targets.some((target) => target.assetId === cause.asset.id && target.property === cause.property)),
          impactRatings: entry.impactRatings
            .filter((rating) => rating.damage_scenario_id === id)
            .map(({ id: ratingId, impact_category, rating_value }) => ({ id: ratingId, impact_category, rating_value })),
        }))
        const attackPaths = relations.attackPaths.map((path) => ({
          ...path,
          feasibility: entry.attackFeasibilityRatings.find((rating) => rating.attack_path_id === path.id)?.feasibility_rating ?? null,
          isPartial: entry.attackPaths.find((ap) => ap.id === path.id)?.is_partial_early_stage ?? false,
        }))
        const feasibility = aggregateFeasibility(attackPaths)
        const riskValues = updateRiskValues(entry, scenario.id, damageScenarios, feasibility?.rating)
        return { damageScenarios, attackPaths, feasibility, riskValues }
      }),
    linkDamageScenario: (projectId, threatScenarioId, damageScenarioId) =>
      run(() => {
        const { entry, scenario } = findThreatScenario(projectId, threatScenarioId)
        if (!entry.damageScenarios.some((ds) => ds.id === damageScenarioId)) throw new ApiError(404, 'Damage scenario not found.')
        addThreatDamageLink(entry, scenario.id, damageScenarioId)
        return relationsOf(entry, scenario.id)
      }),
    unlinkDamageScenario: (projectId, threatScenarioId, damageScenarioId) =>
      run(() => {
        const { entry, scenario } = findThreatScenario(projectId, threatScenarioId)
        removeThreatDamageLink(entry, scenario.id, damageScenarioId)
        return relationsOf(entry, scenario.id)
      }),
    linkAttackPath: (projectId, threatScenarioId, attackPathId) =>
      run(() => {
        const { entry, scenario } = findThreatScenario(projectId, threatScenarioId)
        if (!entry.attackPaths.some((path) => path.id === attackPathId)) throw new ApiError(404, 'Attack path not found.')
        addThreatAttackPathLink(entry, scenario.id, attackPathId)
        return relationsOf(entry, scenario.id)
      }),
    unlinkAttackPath: (projectId, threatScenarioId, attackPathId) =>
      run(() => {
        const { entry, scenario } = findThreatScenario(projectId, threatScenarioId)
        removeThreatAttackPathLink(entry, scenario.id, attackPathId)
        return relationsOf(entry, scenario.id)
      }),
    setTargets: (projectId, threatScenarioId, targets) =>
      run(() => {
        const { entry, scenario } = findThreatScenario(projectId, threatScenarioId)
        for (const { assetId, property } of targets) {
          if (!entry.assets.some((asset) => asset.id === assetId)) throw new ApiError(404, 'Asset not found.')
          if (!isThreatCause(entry, scenario.id, assetId, property)) {
            throw new ApiError(422, `Property ${property} of asset ${assetId} does not lead to a linked damage scenario.`)
          }
        }
        // Same rule as the UNIQUE constraint of `threat_scenario_asset_property`; how many per asset is up to the view.
        if (new Set(targets.map(({ assetId, property }) => `${assetId}:${property}`)).size !== targets.length) {
          throw new ApiError(422, 'Each asset property can only be targeted once.')
        }
        entry.threatTargets = [
          ...entry.threatTargets.filter((target) => target.threat_scenario_id !== scenario.id),
          ...targets.map(({ assetId, property }) => ({ threat_scenario_id: scenario.id, asset_id: assetId, property })),
        ]
        return relationsOf(entry, scenario.id)
      }),
  }
}
