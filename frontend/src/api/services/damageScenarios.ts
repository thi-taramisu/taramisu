import type { CiaProperty } from '../models/asset'
import type {
  DamageScenario,
  DamageScenarioBody,
  DamageScenarioRelations,
  ImpactRating,
  ImpactRatingBody,
  PatchDamageScenarioBody,
} from '../models/damageScenario'

/**
 * Damage scenarios with their impact ratings. Mocked until the damage scenario endpoints exist; calls
 * reject with an `ApiError` like the item service.
 */
export interface DamageScenarioService {
  create(projectId: string, body: DamageScenarioBody): Promise<DamageScenario>
  get(projectId: string, damageScenarioId: string): Promise<DamageScenario>
  update(projectId: string, damageScenarioId: string, body: PatchDamageScenarioBody): Promise<DamageScenario>
  /** Stored ratings only; a category without a row is not rated. */
  impactRatings(projectId: string, damageScenarioId: string): Promise<ImpactRating[]>
  updateImpactRatings(projectId: string, damageScenarioId: string, body: ImpactRatingBody[]): Promise<ImpactRating[]>
  relations(projectId: string, damageScenarioId: string): Promise<DamageScenarioRelations>
  /** Creates the link to the asset or replaces its properties; needs at least one property [RQ-15-02]. */
  linkAsset(projectId: string, damageScenarioId: string, assetId: string, properties: CiaProperty[]): Promise<DamageScenarioRelations>
  unlinkAsset(projectId: string, damageScenarioId: string, assetId: string): Promise<DamageScenarioRelations>
  linkThreatScenario(projectId: string, damageScenarioId: string, threatScenarioId: string): Promise<DamageScenarioRelations>
  unlinkThreatScenario(projectId: string, damageScenarioId: string, threatScenarioId: string): Promise<DamageScenarioRelations>
}
