import { FEASIBILITY } from '../attack-paths/attackFeasibility'
import { categoryLabel, impactLabel } from '../damage-scenarios/impactScale'
import { EntityLink } from './EntityLink'
import { RiskMatrix } from './RiskMatrix'
import type { AggregatedFeasibility, RiskRow } from './riskCalculation'

interface RiskCalculationDetailsProps {
  projectId: string
  row: RiskRow & { impact: NonNullable<RiskRow['impact']>; risk: number }
  feasibility: AggregatedFeasibility & { feasibility: NonNullable<AggregatedFeasibility['feasibility']> }
}

/** How one risk value comes about: impact, attack feasibility and the risk matrix (TS Risks wireframe). */
export function RiskCalculationDetails({ projectId, row, feasibility }: RiskCalculationDetailsProps) {
  const { decisive } = feasibility

  return (
    <div className="@container rounded-md bg-muted/40 p-3">
      <div className="grid gap-4 @2xl:grid-cols-[1fr_auto] @2xl:items-center">
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Impact</dt>
            <dd>
              {impactLabel(row.impact)} {categoryLabel(row.category)?.toLowerCase()} impact of{' '}
              <EntityLink projectId={projectId} type="damage-scenarios" entity={row.damageScenario} tab="impact" />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Attack Feasibility</dt>
            <dd>
              {FEASIBILITY[feasibility.feasibility].label}, from{' '}
              {decisive && <EntityLink projectId={projectId} type="attack-paths" entity={decisive} tab="rating" />}, the most feasible of{' '}
              {feasibility.rated} rated {feasibility.rated === 1 ? 'attack path' : 'attack paths'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Method</dt>
            <dd>Risk matrix: impact × attack feasibility = Risk {row.risk}</dd>
          </div>
        </dl>
        <RiskMatrix impact={row.impact} feasibility={feasibility.feasibility} />
      </div>
    </div>
  )
}
