import type { PatchThreatScenarioBody, ThreatScenario, ThreatScenarioRelations, ThreatTarget } from '../models/threatScenario'

/**
 * Threat scenarios with their links. Mocked until the threat scenario endpoints exist; calls reject
 * with an `ApiError` like the item service.
 */
export interface ThreatScenarioService {
  get(projectId: string, threatScenarioId: string): Promise<ThreatScenario>
  update(projectId: string, threatScenarioId: string, body: PatchThreatScenarioBody): Promise<ThreatScenario>
  relations(projectId: string, threatScenarioId: string): Promise<ThreatScenarioRelations>
  linkDamageScenario(projectId: string, threatScenarioId: string, damageScenarioId: string): Promise<ThreatScenarioRelations>
  unlinkDamageScenario(projectId: string, threatScenarioId: string, damageScenarioId: string): Promise<ThreatScenarioRelations>
  linkAttackPath(projectId: string, threatScenarioId: string, attackPathId: string): Promise<ThreatScenarioRelations>
  unlinkAttackPath(projectId: string, threatScenarioId: string, attackPathId: string): Promise<ThreatScenarioRelations>
  /** Replaces all targets; each has to be a cause of a linked damage scenario. */
  setTargets(projectId: string, threatScenarioId: string, targets: ThreatTarget[]): Promise<ThreatScenarioRelations>
}
