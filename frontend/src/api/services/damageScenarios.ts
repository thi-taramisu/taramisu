import type { DamageScenario, ImpactRating, ImpactRatingBody, PatchDamageScenarioBody } from '../models/damageScenario'

/**
 * Damage scenarios with their impact ratings. Mocked until the damage scenario endpoints exist; calls
 * reject with an `ApiError` like the item service.
 */
export interface DamageScenarioService {
  get(projectId: string, damageScenarioId: string): Promise<DamageScenario>
  update(projectId: string, damageScenarioId: string, body: PatchDamageScenarioBody): Promise<DamageScenario>
  /** Stored ratings only; a category without a row is not rated. */
  impactRatings(projectId: string, damageScenarioId: string): Promise<ImpactRating[]>
  updateImpactRatings(projectId: string, damageScenarioId: string, body: ImpactRatingBody[]): Promise<ImpactRating[]>
}
