/** Risk colour tokens per risk value 1–5; always shown together with the number. */
export const RISK_CLASSES: Record<number, string> = {
  1: 'border-risk-1-border bg-risk-1 text-risk-1-foreground',
  2: 'border-risk-2-border bg-risk-2 text-risk-2-foreground',
  3: 'border-risk-3-border bg-risk-3 text-risk-3-foreground',
  4: 'border-risk-4-border bg-risk-4 text-risk-4-foreground',
  5: 'border-risk-5-border bg-risk-5 text-risk-5-foreground',
}

/** Shape and colour of a risk badge, shared with controls that look like one. */
export function riskBadgeClasses(value: number | null, size: 'sm' | 'lg' = 'sm') {
  const classes = value ? RISK_CLASSES[value] : 'border-rating-unknown-border bg-rating-unknown text-rating-unknown-foreground'
  return `inline-flex items-center rounded-full border font-medium whitespace-nowrap ${size === 'lg' ? 'h-6 px-2.5 text-sm' : 'h-5 px-2 text-xs'} ${classes}`
}

/** Solid dot per risk value 1–5, e.g. for the mark of the highest risk. */
export const RISK_DOT_CLASSES: Record<number, string> = {
  1: 'bg-risk-1-border',
  2: 'bg-risk-2-border',
  3: 'bg-risk-3-border',
  4: 'bg-risk-4-border',
  5: 'bg-risk-5-border',
}
