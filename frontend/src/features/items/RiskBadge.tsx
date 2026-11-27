import { useTranslation } from 'react-i18next'
import type { CiaProperty } from '../../api/models/asset'
import { riskBadgeClasses } from './riskClasses'

/** Risk value 1–5 with the risk colour tokens; the number is in the text, not only in the colour. */
export function RiskBadge({ value, prefix, size = 'sm' }: { value: number | null; prefix?: string; size?: 'sm' | 'lg' }) {
  const { t } = useTranslation()
  return (
    <span className={riskBadgeClasses(value, size)}>
      {value ? [prefix ?? t('ui:risk'), value].filter(Boolean).join(' ') : t('ui:notApplicable')}
    </span>
  )
}

/** C / I / A columns as in the wireframe, e.g. "· I A" for integrity and availability. */
export function CiaProperties({ properties }: { properties: readonly CiaProperty[] }) {
  const { t } = useTranslation()
  return (
    <span className="font-mono text-xs whitespace-nowrap" aria-label={properties.length ? t('ui:propertiesList', { properties: properties.join(', ') }) : t('ui:noProperties')}>
      {(['C', 'I', 'A'] as const).map((p) => (properties.includes(p) ? p : '·')).join(' ')}
    </span>
  )
}
