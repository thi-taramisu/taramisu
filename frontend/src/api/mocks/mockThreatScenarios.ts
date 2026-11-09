import { ApiError } from '../errors'
import type { ThreatScenarioRelations } from '../models/threatScenario'
import type { ThreatScenarioService } from '../services/threatScenarios'
import { addThreatDamageLink, isThreatCause, removeThreatDamageLink, renameNodes, run, syncLinks, titleRef, validateTitle, type StoredItem } from './mockStore'

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
        // Same rule as the UNIQUE constraint of `threat_attack_path_link`.
        if (entry.threatAttackPathLinks.some((link) => link.threat_scenario_id === scenario.id && link.attack_path_id === attackPathId)) {
          throw new ApiError(409, 'The attack path is already linked.')
        }
        entry.threatAttackPathLinks.push({ threat_scenario_id: scenario.id, attack_path_id: attackPathId })
        syncLinks(entry)
        return relationsOf(entry, scenario.id)
      }),
    unlinkAttackPath: (projectId, threatScenarioId, attackPathId) =>
      run(() => {
        const { entry, scenario } = findThreatScenario(projectId, threatScenarioId)
        const remaining = entry.threatAttackPathLinks.filter((link) => link.threat_scenario_id !== scenario.id || link.attack_path_id !== attackPathId)
        if (remaining.length === entry.threatAttackPathLinks.length) throw new ApiError(404, 'Link not found.')
        entry.threatAttackPathLinks = remaining
        syncLinks(entry)
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
