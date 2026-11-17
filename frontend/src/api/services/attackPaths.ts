import type {
  AttackFeasibilityRating,
  AttackFeasibilityRatingBody,
  AttackPath,
  AttackPathRelations,
  PatchAttackPathBody,
} from '../models/attackPath'

/**
 * Attack paths with their rating and links. Mocked until the attack path endpoints exist; calls
 * reject with an `ApiError` like the item service.
 */
export interface AttackPathService {
  get(projectId: string, attackPathId: string): Promise<AttackPath>
  update(projectId: string, attackPathId: string, body: PatchAttackPathBody): Promise<AttackPath>
  /** Null while the attack path is not rated. */
  rating(projectId: string, attackPathId: string): Promise<AttackFeasibilityRating | null>
  updateRating(projectId: string, attackPathId: string, body: AttackFeasibilityRatingBody): Promise<AttackFeasibilityRating>
  relations(projectId: string, attackPathId: string): Promise<AttackPathRelations>
  linkThreatScenario(projectId: string, attackPathId: string, threatScenarioId: string): Promise<AttackPathRelations>
  unlinkThreatScenario(projectId: string, attackPathId: string, threatScenarioId: string): Promise<AttackPathRelations>
}
