import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FeasibilityBadge } from '../attack-paths/FeasibilityBadge'
import { IMPACT_CLASSES, categoryLabel, impactLabel } from '../damage-scenarios/impactScale'
import { RiskBadge } from '../items/RiskBadge'
import { entityPath } from '../workspace/entities'
import { RiskMatrix } from './RiskMatrix'
import type { AggregatedFeasibility, RiskRow } from './riskCalculation'

interface RiskCalculationDetailsProps {
  projectId: string
  row: RiskRow & { impact: NonNullable<RiskRow['impact']>; risk: number }
  feasibility: AggregatedFeasibility & { feasibility: NonNullable<AggregatedFeasibility['feasibility']> }
}

function Step({ term, value, source }: { term: string; value: ReactNode; source: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_6rem_1fr] items-center gap-2">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd>{value}</dd>
      <dd className="text-xs text-muted-foreground">{source}</dd>
    </div>
  )
}

/** How one risk value comes about: impact × attack feasibility in the risk matrix (TS Risks wireframe). */
export function RiskCalculationDetails({ projectId, row, feasibility }: RiskCalculationDetailsProps) {
  const { decisive } = feasibility

  return (
    <div className="@container rounded-md bg-muted/40 p-3">
      <div className="grid gap-4 @2xl:grid-cols-[1fr_auto] @2xl:items-center">
        <dl className="grid gap-2 text-sm">
          <Step
            term="Impact"
            value={
              <span className={`inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium ${IMPACT_CLASSES[row.impact]}`}>
                {impactLabel(row.impact)}
              </span>
            }
            source={
              <>
                {categoryLabel(row.category)} ·{' '}
                <Link to={`${entityPath(projectId, 'damage-scenarios', row.damageScenario.id)}/impact`} className="hover:underline">
                  {row.damageScenario.code}
                </Link>
              </>
            }
          />
          <Step
            term="Feasibility"
            value={<FeasibilityBadge value={feasibility.feasibility} withWord={false} size="sm" />}
            source={
              decisive && (
                <>
                  <Link to={`${entityPath(projectId, 'attack-paths', decisive.id)}/rating`} className="hover:underline">
                    {decisive.code}
                  </Link>{' '}
                  · most feasible of {feasibility.rated} rated
                </>
              )
            }
          />
          <Step term="Risk" value={<RiskBadge value={row.risk} />} source="Risk matrix" />
        </dl>
        <RiskMatrix impact={row.impact} feasibility={feasibility.feasibility} />
      </div>
    </div>
  )
}
