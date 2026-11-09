import { ApiError } from '../errors'
import type { AttackFeasibilityRatingBody, AttackPathRelations } from '../models/attackPath'
import type { AttackPathService } from '../services/attackPaths'
import { addThreatAttackPathLink, removeThreatAttackPathLink, renameNodes, run, titleRef, validateTitle, type StoredItem } from './mockStore'

function relationsOf(entry: StoredItem, attackPathId: string): AttackPathRelations {
  return {
    threatScenarios: entry.threatScenarios
      .filter((threat) => entry.threatAttackPathLinks.some((link) => link.threat_scenario_id === threat.id && link.attack_path_id === attackPathId))
      .map(titleRef),
  }
}

// Same rules as the CHECK constraints of `attack_feasibility_rating` in backend/db/schema.sql.
function validateRating(body: AttackFeasibilityRatingBody) {
  const factors = [body.ap_elapsed_time, body.ap_specialist_expertise, body.ap_knowledge_of_item, body.ap_window_of_opportunity, body.ap_equipment]
  if (factors.some((factor) => factor !== null && factor < 0)) throw new ApiError(422, 'Factors cannot be negative.')
  if (body.ap_total_score === null) return
  if (factors.includes(null) || body.ap_total_score !== factors.reduce<number>((sum, factor) => sum + (factor ?? 0), 0)) {
    throw new ApiError(422, 'The total score must be the sum of all five factors.')
  }
}

/** MOCK: attack path service on the stored data of the in-memory item API. */
export function createMockAttackPathService(db: Map<string, StoredItem>): AttackPathService {
  function findAttackPath(projectId: string, attackPathId: string) {
    for (const entry of db.values()) {
      const path = entry.attackPaths.find((ap) => ap.id === attackPathId)
      if (path && entry.item.tara_project_id === projectId) return { entry, path }
    }
    throw new ApiError(404, 'Attack path not found.')
  }

  return {
    get: (projectId, attackPathId) => run(() => findAttackPath(projectId, attackPathId).path),
    update: (projectId, attackPathId, body) =>
      run(() => {
        const { entry, path } = findAttackPath(projectId, attackPathId)
        const title = validateTitle(body.title)
        Object.assign(path, body, title === undefined ? {} : { title })
        renameNodes(entry.children, { type: 'attack-paths', id: path.id, name: path.title })
        return path
      }),
    rating: (projectId, attackPathId) =>
      run(() => {
        const { entry, path } = findAttackPath(projectId, attackPathId)
        return entry.attackFeasibilityRatings.find((rating) => rating.attack_path_id === path.id) ?? null
      }),
    updateRating: (projectId, attackPathId, body) =>
      run(() => {
        const { entry, path } = findAttackPath(projectId, attackPathId)
        validateRating(body)
        const stored = entry.attackFeasibilityRatings.find((rating) => rating.attack_path_id === path.id)
        if (stored) return Object.assign(stored, body)
        const rating = { ...body, id: crypto.randomUUID(), attack_path_id: path.id }
        entry.attackFeasibilityRatings.push(rating)
        return rating
      }),
    relations: (projectId, attackPathId) =>
      run(() => {
        const { entry, path } = findAttackPath(projectId, attackPathId)
        return relationsOf(entry, path.id)
      }),
    linkThreatScenario: (projectId, attackPathId, threatScenarioId) =>
      run(() => {
        const { entry, path } = findAttackPath(projectId, attackPathId)
        if (!entry.threatScenarios.some((threat) => threat.id === threatScenarioId)) throw new ApiError(404, 'Threat scenario not found.')
        addThreatAttackPathLink(entry, threatScenarioId, path.id)
        return relationsOf(entry, path.id)
      }),
    unlinkThreatScenario: (projectId, attackPathId, threatScenarioId) =>
      run(() => {
        const { entry, path } = findAttackPath(projectId, attackPathId)
        removeThreatAttackPathLink(entry, threatScenarioId, path.id)
        return relationsOf(entry, path.id)
      }),
  }
}
