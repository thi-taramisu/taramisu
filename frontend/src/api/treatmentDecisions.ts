import type { ApiClient } from './client'
import { readAllPages } from './pagination'
import type { components } from './schema'
import { unwrap } from './unwrap'

export type TreatmentDecision = components['schemas']['RiskTreatmentDecision']
export type TreatmentDecisionBody = components['schemas']['RiskTreatmentDecisionBody']

const decisions = '/api/v1/threat-scenarios/{threat_scenario_id}/risk-treatment-decisions'
const decision = '/api/v1/threat-scenarios/{threat_scenario_id}/risk-treatment-decisions/{id}'
const risks = '/api/v1/threat-scenarios/{threat_scenario_id}/risk-values'

export function createTreatmentDecisionApi(client: ApiClient, threatScenarioId: string) {
  const path = { threat_scenario_id: threatScenarioId }
  return {
    list: (signal?: AbortSignal) => readAllPages(async (query) =>
      (await unwrap(client.GET(decisions, { params: { path, query }, signal }))) ?? [],
    ),
    riskValues: (signal?: AbortSignal) => readAllPages(async (query) =>
      (await unwrap(client.GET(risks, { params: { path, query }, signal }))) ?? [],
    ),
    create: (body: TreatmentDecisionBody) => unwrap(client.POST(decisions, { params: { path }, body })),
    update: (id: string, body: TreatmentDecisionBody) =>
      unwrap(client.PATCH(decision, { params: { path: { ...path, id } }, body })),
    delete: (id: string) => unwrap(client.DELETE(decision, { params: { path: { ...path, id } } })),
  }
}
