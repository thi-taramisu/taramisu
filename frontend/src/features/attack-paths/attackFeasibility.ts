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
    label: 'ui:elapsedTime',
    options: [
      { label: 'ui:upToOneDay', score: 0 },
      { label: 'ui:upToOneWeek', score: 1 },
      { label: 'ui:upToOneMonth', score: 4 },
      { label: 'ui:upToSixMonths', score: 17 },
      { label: 'ui:overSixMonths', score: 19 },
    ],
  },
  {
    key: 'ap_specialist_expertise',
    label: 'ui:specialistExpertise',
    options: [
      { label: 'ui:layman', score: 0 },
      { label: 'ui:proficient', score: 3 },
      { label: 'ui:expert', score: 6 },
      { label: 'ui:multipleExperts', score: 8 },
    ],
  },
  {
    key: 'ap_knowledge_of_item',
    label: 'ui:knowledgeOfTheItem',
    options: [
      { label: 'ui:public', score: 0 },
      { label: 'ui:restricted', score: 3 },
      { label: 'ui:confidential', score: 7 },
      { label: 'ui:strictlyConfidential', score: 11 },
    ],
  },
  {
    key: 'ap_window_of_opportunity',
    label: 'ui:windowOfOpportunity',
    options: [
      { label: 'ui:unlimited', score: 0 },
      { label: 'ui:easy', score: 1 },
      { label: 'ui:moderate', score: 4 },
      { label: 'ui:difficultNone', score: 10 },
    ],
  },
  {
    key: 'ap_equipment',
    label: 'ui:equipment',
    options: [
      { label: 'ui:standard', score: 0 },
      { label: 'ui:specialized', score: 4 },
      { label: 'ui:bespoke', score: 7 },
      { label: 'ui:multipleBespoke', score: 9 },
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
  HIGH: { label: 'ui:high', classes: 'border-feasibility-high-border bg-feasibility-high text-feasibility-high-foreground' },
  MEDIUM: { label: 'ui:medium', classes: 'border-feasibility-medium-border bg-feasibility-medium text-feasibility-medium-foreground' },
  LOW: { label: 'ui:low', classes: 'border-feasibility-low-border bg-feasibility-low text-feasibility-low-foreground' },
  VERY_LOW: { label: 'ui:veryLow', classes: 'border-feasibility-very-low-border bg-feasibility-very-low text-feasibility-very-low-foreground' },
}

/** Solid dot per feasibility level; always shown next to the level's label. */
export const FEASIBILITY_DOT_CLASSES: Record<AttackFeasibility, string> = {
  HIGH: 'bg-feasibility-high-border',
  MEDIUM: 'bg-feasibility-medium-border',
  LOW: 'bg-feasibility-low-border',
  VERY_LOW: 'bg-feasibility-very-low-border',
}
