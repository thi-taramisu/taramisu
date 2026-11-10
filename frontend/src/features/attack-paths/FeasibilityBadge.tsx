import type { AttackFeasibility } from '../../api/models/attackPath'
import { FEASIBILITY } from './attackFeasibility'

/** Feasibility level with its colour tokens; the level is always in the text, not only in the colour. */
export function FeasibilityBadge({ value, withWord = true }: { value: AttackFeasibility; withWord?: boolean }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-sm font-medium whitespace-nowrap ${FEASIBILITY[value].classes}`}>
      {FEASIBILITY[value].label}
      {withWord && ' feasibility'}
    </span>
  )
}
