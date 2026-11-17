export const riskClasses: Record<number, string> = {
  1: 'border-risk-1-border bg-risk-1 text-risk-1-foreground',
  2: 'border-risk-2-border bg-risk-2 text-risk-2-foreground',
  3: 'border-risk-3-border bg-risk-3 text-risk-3-foreground',
  4: 'border-risk-4-border bg-risk-4 text-risk-4-foreground',
  5: 'border-risk-5-border bg-risk-5 text-risk-5-foreground',
}
export const riskText = (risk: number | null) => risk === null ? 'Not rated' : `Risk ${risk}`
export const riskStroke = (risk: number | null) => risk === null ? 'var(--muted-foreground)' : `var(--risk-${risk}-border)`
