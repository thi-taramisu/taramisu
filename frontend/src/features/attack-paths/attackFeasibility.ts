import type { AttackFeasibility, AttackFeasibilityRating } from '../../api/models/attackPath'

export type FactorKey = 'ap_elapsed_time' | 'ap_specialist_expertise' | 'ap_knowledge_of_item' | 'ap_window_of_opportunity' | 'ap_equipment'

export interface Factor {
  key: FactorKey
  label: string
  options: { label: string; score: number }[]
}

// Attack potential factors and scores of the interactive wireframe [RC-15-12].
export const FACTORS: Factor[] = [
  {
    key: 'ap_elapsed_time',
    label: 'Elapsed Time',
    options: [
      { label: '≤1 day', score: 0 },
      { label: '≤1 week', score: 1 },
      { label: '≤1 month', score: 4 },
      { label: '≤6 months', score: 17 },
      { label: '>6 months', score: 19 },
    ],
  },
  {
    key: 'ap_specialist_expertise',
    label: 'Specialist Expertise',
    options: [
      { label: 'Layman', score: 0 },
      { label: 'Proficient', score: 3 },
      { label: 'Expert', score: 6 },
      { label: 'Multiple experts', score: 8 },
    ],
  },
  {
    key: 'ap_knowledge_of_item',
    label: 'Knowledge of the Item',
    options: [
      { label: 'Public', score: 0 },
      { label: 'Restricted', score: 3 },
      { label: 'Confidential', score: 7 },
      { label: 'Strictly confidential', score: 11 },
    ],
  },
  {
    key: 'ap_window_of_opportunity',
    label: 'Window of Opportunity',
    options: [
      { label: 'Unlimited', score: 0 },
      { label: 'Easy', score: 1 },
      { label: 'Moderate', score: 4 },
      { label: 'Difficult / none', score: 10 },
    ],
  },
  {
    key: 'ap_equipment',
    label: 'Equipment',
    options: [
      { label: 'Standard', score: 0 },
      { label: 'Specialized', score: 4 },
      { label: 'Bespoke', score: 7 },
      { label: 'Multiple bespoke', score: 9 },
    ],
  },
]

export type FactorScores = Pick<AttackFeasibilityRating, FactorKey>

/** Thresholds of the interactive wireframe: the higher the attack potential needed, the less feasible the attack. */
export function feasibilityOf(total: number): AttackFeasibility {
  if (total <= 13) return 'HIGH'
  if (total <= 19) return 'MEDIUM'
  if (total <= 24) return 'LOW'
  return 'VERY_LOW'
}

/** Total and feasibility of the factors; both stay empty until all five are rated. */
export function summarize(scores: FactorScores) {
  const values = FACTORS.map(({ key }) => scores[key])
  const open = values.filter((value) => value === null).length
  if (open > 0) return { open, total: null, feasibility: null }
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  return { open, total, feasibility: feasibilityOf(total) }
}

/** Labels and colour tokens of the feasibility levels. */
export const FEASIBILITY: Record<AttackFeasibility, { label: string; classes: string }> = {
  HIGH: { label: 'High', classes: 'border-feasibility-high-border bg-feasibility-high text-feasibility-high-foreground' },
  MEDIUM: { label: 'Medium', classes: 'border-feasibility-medium-border bg-feasibility-medium text-feasibility-medium-foreground' },
  LOW: { label: 'Low', classes: 'border-feasibility-low-border bg-feasibility-low text-feasibility-low-foreground' },
  VERY_LOW: { label: 'Very low', classes: 'border-feasibility-very-low-border bg-feasibility-very-low text-feasibility-very-low-foreground' },
}
