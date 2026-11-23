import { useTranslation } from 'react-i18next'
import type { AttackFeasibility } from '../../api/models/attackPath'
import { cn } from '@/lib/utils'
import { FEASIBILITY } from '../attack-paths/attackFeasibility'
import { IMPACT_SCALE } from '../damage-scenarios/impactScale'
import { RISK_CLASSES } from '../items/riskClasses'
import { FEASIBILITY_ORDER, RISK_MATRIX, type RatedImpact } from '../../api/riskMatrix'

// Impact rises from the bottom, so Severe is the lowest row and the highest risk sits at the bottom right.
const IMPACT_ROWS = IMPACT_SCALE.toReversed()

/** The risk matrix with the row of the impact, the column of the feasibility and their cell marked (TS Risks wireframe). */
export function RiskMatrix({ impact, feasibility }: { impact: RatedImpact; feasibility: AttackFeasibility }) {
  const { t } = useTranslation()
  const axis = 'text-[10px] font-medium tracking-wide text-muted-foreground uppercase'
  return (
    <table className="border-separate border-spacing-0.5 text-[11px]">
      <caption className="sr-only">{t('ui:riskMatrixImpactAttackFeasibility')}</caption>
      <thead>
        <tr>
          {/* One corner over the vertical axis label and the impact levels. */}
          <th scope="col" colSpan={2} rowSpan={2}>
            <span className="sr-only">{t('ui:impactLevel')}</span>
          </th>
          <th scope="colgroup" colSpan={FEASIBILITY_ORDER.length} className={cn(axis, 'text-center')}>{t('ui:attackFeasibility')}</th>
        </tr>
        <tr>
          {FEASIBILITY_ORDER.map((level) => (
            <th key={level} scope="col" className={cn('px-0.5 pb-0.5 font-normal whitespace-nowrap', level === feasibility ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {t(FEASIBILITY[level].label)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {IMPACT_ROWS.map((row, index) => (
          <tr key={row.value}>
            {/* The axis label runs up the left side; the row headers already name each impact level. */}
            {index === 0 && (
              <td rowSpan={IMPACT_ROWS.length} aria-hidden="true" className={cn(axis, 'w-4 min-w-4 pr-1 text-center align-middle')}>
                <span className="inline-block rotate-180 leading-none [writing-mode:vertical-rl]">{t('navigation.tabs.impact')}</span>
              </td>
            )}
            <th scope="row" className={cn('pr-2 text-right font-normal', row.value === impact ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {t(row.label)}
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
                    'h-6 w-11 rounded border text-center font-medium tabular-nums',
                    RISK_CLASSES[value],
                    current ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background' : onPath && 'ring-1 ring-foreground/30',
                  )}
                >
                  {value}
                  {current && <span className="sr-only"> {t('ui:thisRiskValue')}</span>}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
