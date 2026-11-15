import type { AttackFeasibility } from '../../api/models/attackPath'
import type { ImpactCategory, ImpactRatingValue } from '../../api/models/damageScenario'
import type { ThreatCause, ThreatScenarioRiskInputs } from '../../api/models/threatScenario'
import type { EntityRef } from '../../api/models/tree'
import { IMPACT_CATEGORIES } from '../damage-scenarios/impactScale'

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

type AttackPathInput = ThreatScenarioRiskInputs['attackPaths'][number]

export interface AggregatedFeasibility {
  feasibility: AttackFeasibility | null
  /** The most feasible attack path, which decides the feasibility of the threat scenario (15.8.2 NOTE 2). */
  decisive: AttackPathInput | null
  rated: number
  /** Linked attack paths without a rating; a rating can still raise the feasibility. */
  unrated: AttackPathInput[]
}

export function aggregateFeasibility(attackPaths: AttackPathInput[]): AggregatedFeasibility {
  let decisive: AttackPathInput | null = null
  let level: AttackFeasibility | null = null
  for (const path of attackPaths) {
    if (path.feasibility === null) continue
    if (level === null || FEASIBILITY_ORDER.indexOf(path.feasibility) > FEASIBILITY_ORDER.indexOf(level)) {
      decisive = path
      level = path.feasibility
    }
  }
  const unrated = attackPaths.filter((path) => path.feasibility === null)
  return { feasibility: level, decisive, rated: attackPaths.length - unrated.length, unrated }
}

/** Rated categories get a risk value; omitted ones are a justified decision [PM-15-07]; not rated ones are open work. */
export type CategoryState = 'RATED' | 'OMITTED' | 'NOT_RATED'

export interface RiskRow {
  key: string
  damageScenario: EntityRef
  category: ImpactCategory
  state: CategoryState
  impact: RatedImpact | null
  risk: number | null
}

/** A row with a risk value: its impact is rated and the threat scenario has a feasibility. */
export type RatedRiskRow = RiskRow & { impact: RatedImpact; risk: number }
export const isRated = (row: RiskRow): row is RatedRiskRow => row.risk !== null

export interface RiskGroup {
  damageScenario: EntityRef
  /** The threat's targets that lead to this damage scenario, which is why it belongs to the threat (RQ-15-03). */
  targetedCauses: ThreatCause[]
  /** False while none of the targets leads to the damage scenario: its risk values are shown, but the link is in doubt, so they do not count for the threat scenario. */
  counts: boolean
  rows: RiskRow[]
  max: number | null
}

export type RiskBlocker = 'NO_DAMAGE_SCENARIO' | 'NO_ATTACK_PATH' | 'NO_RATED_ATTACK_PATH'

/** The feasibility once an attack path is rated: the decisive path is then known. */
export type RatedFeasibility = AggregatedFeasibility & { feasibility: AttackFeasibility; decisive: AttackPathInput }

interface RiskValues {
  groups: RiskGroup[]
  /** Highest risk value of the damage scenarios that count, the overall risk of the threat scenario [RQ-15-16]. */
  max: number | null
}

/** `missing` lists everything a risk value still needs, so all of it can be added at once; null once nothing is missing. */
export type RiskResult = RiskValues & ({ missing: null; feasibility: RatedFeasibility } | { missing: RiskBlocker[]; feasibility: AggregatedFeasibility })

function maxOf(values: (number | null)[]) {
  const numbers = values.filter((value): value is number => value !== null)
  return numbers.length ? Math.max(...numbers) : null
}

/** One risk value per linked damage scenario and rated impact category [RQ-15-15], with the risk matrix. */
export function calculateRisks(inputs: ThreatScenarioRiskInputs): RiskResult {
  const feasibility = aggregateFeasibility(inputs.attackPaths)
  const groups = inputs.damageScenarios.map(({ impactRatings, targetedCauses, ...damageScenario }) => {
    const rows = IMPACT_CATEGORIES.map(({ value: category }): RiskRow => {
      const rating = impactRatings.find((r) => r.impact_category === category)
      const value = rating?.rating_value ?? null
      const impact = value && value !== 'OMITTED' ? value : null
      return {
        key: `${damageScenario.id}:${category}`,
        damageScenario,
        category,
        state: impact ? 'RATED' : value === 'OMITTED' ? 'OMITTED' : 'NOT_RATED',
        impact,
        risk: impact && feasibility.feasibility ? RISK_MATRIX[impact][feasibility.feasibility] : null,
      }
    })
    return { damageScenario, targetedCauses, counts: targetedCauses.length > 0, rows, max: maxOf(rows.map((row) => row.risk)) }
  })
  const max = maxOf(groups.filter((group) => group.counts).map((group) => group.max))
  const { feasibility: level, decisive } = feasibility
  const missing: RiskBlocker[] = []
  if (inputs.damageScenarios.length === 0) missing.push('NO_DAMAGE_SCENARIO')
  if (inputs.attackPaths.length === 0) missing.push('NO_ATTACK_PATH')
  else if (!level) missing.push('NO_RATED_ATTACK_PATH')
  if (missing.length > 0 || !level || !decisive) return { feasibility, groups, max, missing }
  return { feasibility: { ...feasibility, feasibility: level, decisive }, groups, max, missing: null }
}
