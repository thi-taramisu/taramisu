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

/** One part of the formula: what it is, its value and where it comes from. */
function Operand({ label, value, source }: { label: string; value: ReactNode; source: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-1">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      {value}
      <span className="text-xs text-muted-foreground">{source}</span>
    </div>
  )
}

function Operator({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="pt-5 text-lg text-muted-foreground">
      {children}
    </span>
  )
}

/** How one risk value comes about: impact and attack feasibility looked up in the risk matrix (TS Risks wireframe). */
export function RiskCalculationDetails({ projectId, row, feasibility }: RiskCalculationDetailsProps) {
  const { decisive } = feasibility

  return (
    <div className="@container rounded-md bg-muted/40 p-3">
      <div className="grid gap-5 @2xl:grid-cols-[1fr_auto] @2xl:items-center">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <Operand
            label="Impact"
            value={
              <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-sm font-medium ${IMPACT_CLASSES[row.impact]}`}>
                {impactLabel(row.impact)}
              </span>
            }
            source={
              <>
                {categoryLabel(row.category)} of{' '}
                <Link to={`${entityPath(projectId, 'damage-scenarios', row.damageScenario.id)}/impact`} className="underline">
                  {row.damageScenario.code}
                </Link>
              </>
            }
          />
          <Operator>×</Operator>
          <Operand
            label="Attack Feasibility"
            value={<FeasibilityBadge value={feasibility.feasibility} withWord={false} />}
            source={
              decisive && (
                <>
                  <Link to={`${entityPath(projectId, 'attack-paths', decisive.id)}/rating`} className="underline">
                    {decisive.code}
                  </Link>
                  , most feasible of {feasibility.rated} rated
                </>
              )
            }
          />
          <Operator>=</Operator>
          <Operand label="Risk Value" value={<RiskBadge value={row.risk} size="lg" />} source="looked up in the risk matrix" />
        </div>
        <RiskMatrix impact={row.impact} feasibility={feasibility.feasibility} />
      </div>
    </div>
  )
}
