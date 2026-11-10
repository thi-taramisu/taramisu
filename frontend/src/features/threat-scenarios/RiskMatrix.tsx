import type { AttackFeasibility } from '../../api/models/attackPath'
import { cn } from '@/lib/utils'
import { FEASIBILITY } from '../attack-paths/attackFeasibility'
import { IMPACT_SCALE } from '../damage-scenarios/impactScale'
import { RISK_CLASSES } from '../items/riskClasses'
import { FEASIBILITY_ORDER, RISK_MATRIX, type RatedImpact } from './riskCalculation'

/** The risk matrix with the row of the impact, the column of the feasibility and their cell marked (TS Risks wireframe). */
export function RiskMatrix({ impact, feasibility }: { impact: RatedImpact; feasibility: AttackFeasibility }) {
  const axis = 'text-[11px] font-medium tracking-wide text-muted-foreground uppercase'
  return (
    <table className="border-separate border-spacing-1 text-xs">
      <caption className="sr-only">Risk matrix: impact × attack feasibility</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(axis, 'pr-2 text-right align-bottom')}>
            Impact
          </th>
          <th scope="colgroup" colSpan={FEASIBILITY_ORDER.length} className={cn(axis, 'text-center')}>
            Attack Feasibility
          </th>
        </tr>
        <tr>
          <th scope="col">
            <span className="sr-only">Impact level</span>
          </th>
          {FEASIBILITY_ORDER.map((level) => (
            <th key={level} scope="col" className={cn('px-1 font-normal', level === feasibility ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {FEASIBILITY[level].label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {IMPACT_SCALE.map((row) => (
          <tr key={row.value}>
            <th scope="row" className={cn('pr-2 text-right font-normal', row.value === impact ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {row.label}
            </th>
            {FEASIBILITY_ORDER.map((level) => {
              const value = RISK_MATRIX[row.value][level]
              const current = row.value === impact && level === feasibility
              // The row and the column of the inputs are outlined, so the lookup can be followed in the scheme's colours.
              const onPath = row.value === impact || level === feasibility
              return (
                <td
                  key={level}
                  aria-current={current || undefined}
                  className={cn(
                    'h-7 w-14 rounded-md border text-center font-medium tabular-nums',
                    RISK_CLASSES[value],
                    current ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background' : onPath && 'ring-1 ring-foreground/30',
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
