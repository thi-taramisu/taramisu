import type { AttackFeasibility } from '../../api/models/attackPath'
import { cn } from '@/lib/utils'
import { FEASIBILITY } from '../attack-paths/attackFeasibility'
import { IMPACT_SCALE } from '../damage-scenarios/impactScale'
import { RISK_CLASSES } from '../items/riskClasses'
import { FEASIBILITY_ORDER, RISK_MATRIX, type RatedImpact } from './riskCalculation'

/** The risk matrix with the cell of the current risk value marked (TS Risks wireframe). */
export function RiskMatrix({ impact, feasibility }: { impact: RatedImpact; feasibility: AttackFeasibility }) {
  return (
    <table className="border-separate border-spacing-1 text-xs">
      <caption className="sr-only">Risk matrix: impact × attack feasibility</caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Impact \ Attack feasibility</span>
          </th>
          {FEASIBILITY_ORDER.map((level) => (
            <th key={level} scope="col" className="px-1 font-normal text-muted-foreground">
              {FEASIBILITY[level].label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {IMPACT_SCALE.map((row) => (
          <tr key={row.value}>
            <th scope="row" className="pr-2 text-right font-normal text-muted-foreground">
              {row.label}
            </th>
            {FEASIBILITY_ORDER.map((level) => {
              const value = RISK_MATRIX[row.value][level]
              const current = row.value === impact && level === feasibility
              return (
                <td
                  key={level}
                  aria-current={current || undefined}
                  className={cn(
                    'h-7 w-14 rounded-md border text-center font-medium tabular-nums',
                    RISK_CLASSES[value],
                    current && 'ring-2 ring-foreground ring-offset-1 ring-offset-background',
                  )}
                >
                  {value}
                  {current && <span className="sr-only"> (this risk value)</span>}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
