import type { AttackFeasibility } from './models/attackPath'
import type { ImpactRatingValue } from './models/damageScenario'

// The risk matrix the backend determines risk values with. The mock calculates with it, and the Risks tab shows it
// to explain a value; it would come from the backend if the matrix becomes configurable.

export type RatedImpact = Exclude<ImpactRatingValue, 'OMITTED'>

/** Feasibility levels from the least to the most feasible. */
export const FEASIBILITY_ORDER: AttackFeasibility[] = ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH']

// Risk matrix of the interactive wireframe (15.8.2 EXAMPLE): impact × attack feasibility → risk value 1–5.
export const RISK_MATRIX: Record<RatedImpact, Record<AttackFeasibility, number>> = {
  SEVERE: { VERY_LOW: 2, LOW: 3, MEDIUM: 4, HIGH: 5 },
  MAJOR: { VERY_LOW: 1, LOW: 2, MEDIUM: 3, HIGH: 4 },
  MODERATE: { VERY_LOW: 1, LOW: 2, MEDIUM: 2, HIGH: 3 },
  NEGLIGIBLE: { VERY_LOW: 1, LOW: 1, MEDIUM: 1, HIGH: 1 },
}
