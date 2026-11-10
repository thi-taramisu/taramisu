import type { AttackFeasibility } from '../../api/models/attackPath'
import { FEASIBILITY } from './attackFeasibility'

/** Feasibility level with its colour tokens; the level is always in the text, not only in the colour. */
export function FeasibilityBadge({ value, withWord = true, size = 'lg' }: { value: AttackFeasibility; withWord?: boolean; size?: 'sm' | 'lg' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${size === 'lg' ? 'h-6 px-2.5 text-sm' : 'h-5 px-2 text-xs'} ${FEASIBILITY[value].classes}`}
    >
      {FEASIBILITY[value].label}
      {withWord && ' feasibility'}
    </span>
  )
}
