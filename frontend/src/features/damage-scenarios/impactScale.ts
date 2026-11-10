import type { ImpactCategory, ImpactRatingValue } from '../../api/models/damageScenario'

export const IMPACT_CATEGORIES: { value: ImpactCategory; label: string }[] = [
  { value: 'SAFETY', label: 'Safety' },
  { value: 'FINANCIAL', label: 'Financial' },
  { value: 'OPERATIONAL', label: 'Operational' },
  { value: 'PRIVACY', label: 'Privacy' },
]

/** The rating levels from the highest impact down; OMITTED is not a level of the scale. */
export const IMPACT_SCALE: { value: Exclude<ImpactRatingValue, 'OMITTED'>; label: string }[] = [
  { value: 'SEVERE', label: 'Severe' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'NEGLIGIBLE', label: 'Negligible' },
]

export const categoryLabel = (value: ImpactCategory) => IMPACT_CATEGORIES.find((category) => category.value === value)?.label
export const impactLabel = (value: ImpactRatingValue) => IMPACT_SCALE.find((level) => level.value === value)?.label

/** Impact colour tokens per rating; always shown together with the rating label. */
export const IMPACT_CLASSES: Record<ImpactRatingValue, string> = {
  SEVERE: 'border-impact-severe-border bg-impact-severe text-impact-severe-foreground',
  MAJOR: 'border-impact-major-border bg-impact-major text-impact-major-foreground',
  MODERATE: 'border-impact-moderate-border bg-impact-moderate text-impact-moderate-foreground',
  NEGLIGIBLE: 'border-impact-negligible-border bg-impact-negligible text-impact-negligible-foreground',
  OMITTED: 'border-impact-omitted-border bg-impact-omitted text-impact-omitted-foreground',
}
