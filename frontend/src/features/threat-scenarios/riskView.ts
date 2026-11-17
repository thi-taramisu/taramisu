import type { AttackFeasibility } from '../../api/models/attackPath'
import type { ImpactCategory } from '../../api/models/damageScenario'
import type { ThreatCause, ThreatScenarioRisks } from '../../api/models/threatScenario'
import type { EntityRef } from '../../api/models/tree'
import type { RatedImpact } from '../../api/riskMatrix'
import { IMPACT_CATEGORIES } from '../damage-scenarios/impactScale'

// Arranges the risks the backend calculated for the Risks tab; the risk values and the feasibility are not calculated here.

type AttackPathInput = ThreatScenarioRisks['attackPaths'][number]

export interface AggregatedFeasibility {
  feasibility: AttackFeasibility | null
  /** The most feasible attack path, which decides the feasibility of the threat scenario (15.8.2 NOTE 2). */
  decisive: AttackPathInput | null
  /** Linked attack paths without a rating; a rating can still raise the feasibility unless it is already High. */
  unrated: AttackPathInput[]
}

function feasibilityOf({ attackPaths, feasibility }: ThreatScenarioRisks): AggregatedFeasibility {
  const unrated = attackPaths.filter((path) => path.feasibility === null)
  return {
    feasibility: feasibility?.rating ?? null,
    decisive: attackPaths.find((path) => path.id === feasibility?.attackPathId) ?? null,
    unrated,
  }
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

/** The risk values per linked damage scenario and impact category [RQ-15-15], with the categories that have none. */
export function riskView(risks: ThreatScenarioRisks): RiskResult {
  const feasibility = feasibilityOf(risks)
  const groups = risks.damageScenarios.map(({ impactRatings, targetedCauses, ...damageScenario }) => {
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
        risk: (impact && risks.riskValues.find((riskValue) => riskValue.impact_rating_id === rating?.id)?.risk_score) ?? null,
      }
    })
    return { damageScenario, targetedCauses, counts: targetedCauses.length > 0, rows, max: maxOf(rows.map((row) => row.risk)) }
  })
  const max = maxOf(groups.filter((group) => group.counts).map((group) => group.max))
  const { feasibility: level, decisive } = feasibility
  const missing: RiskBlocker[] = []
  if (risks.damageScenarios.length === 0) missing.push('NO_DAMAGE_SCENARIO')
  if (risks.attackPaths.length === 0) missing.push('NO_ATTACK_PATH')
  else if (!level) missing.push('NO_RATED_ATTACK_PATH')
  if (missing.length > 0 || !level || !decisive) return { feasibility, groups, max, missing }
  return { feasibility: { ...feasibility, feasibility: level, decisive }, groups, max, missing: null }
}
