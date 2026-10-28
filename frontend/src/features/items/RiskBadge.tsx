import type { CiaProperty } from '../../api/models/asset'

const RISK_CLASSES: Record<number, string> = {
  1: 'border-risk-1-border bg-risk-1 text-risk-1-foreground',
  2: 'border-risk-2-border bg-risk-2 text-risk-2-foreground',
  3: 'border-risk-3-border bg-risk-3 text-risk-3-foreground',
  4: 'border-risk-4-border bg-risk-4 text-risk-4-foreground',
  5: 'border-risk-5-border bg-risk-5 text-risk-5-foreground',
}

/** Risk value 1–5 with the risk colour tokens; the number is in the text, not only in the colour. */
export function RiskBadge({ value, prefix = 'Risk' }: { value: number | null; prefix?: string }) {
  const classes = value ? RISK_CLASSES[value] : 'border-rating-unknown-border bg-rating-unknown text-rating-unknown-foreground'
  return (
    <span className={`inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap ${classes}`}>
      {value ? [prefix, value].filter(Boolean).join(' ') : 'N/A'}
    </span>
  )
}

/** C / I / A columns as in the wireframe, e.g. "· I A" for integrity and availability. */
export function CiaProperties({ properties }: { properties: readonly CiaProperty[] }) {
  return (
    <span className="font-mono text-xs whitespace-nowrap" aria-label={properties.length ? `Properties ${properties.join(', ')}` : 'No properties'}>
      {(['C', 'I', 'A'] as const).map((p) => (properties.includes(p) ? p : '·')).join(' ')}
    </span>
  )
}
