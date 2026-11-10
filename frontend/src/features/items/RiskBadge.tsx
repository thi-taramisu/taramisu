import type { CiaProperty } from '../../api/models/asset'
import { RISK_CLASSES } from './riskClasses'

/** Risk value 1–5 with the risk colour tokens; the number is in the text, not only in the colour. */
export function RiskBadge({ value, prefix = 'Risk', size = 'sm' }: { value: number | null; prefix?: string; size?: 'sm' | 'lg' }) {
  const classes = value ? RISK_CLASSES[value] : 'border-rating-unknown-border bg-rating-unknown text-rating-unknown-foreground'
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${size === 'lg' ? 'h-6 px-2.5 text-sm' : 'h-5 px-2 text-xs'} ${classes}`}
    >
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
