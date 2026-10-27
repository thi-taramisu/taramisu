export const colorSchemes = [
  { id: 'neutral', name: 'Neutral', description: 'Monochrome surfaces and charcoal controls.' },
  { id: 'ocean', name: 'Ocean', description: 'Cool slate surfaces and blue controls.' },
  { id: 'iris', name: 'Iris', description: 'Warm stone surfaces and violet controls.' },
] as const

export type ColorScheme = typeof colorSchemes[number]

export const ratingGroups = [
  {
    name: 'Risk scores',
    entries: [
      { label: 'Risk 1', className: 'border-risk-1-border bg-risk-1 text-risk-1-foreground' },
      { label: 'Risk 2', className: 'border-risk-2-border bg-risk-2 text-risk-2-foreground' },
      { label: 'Risk 3', className: 'border-risk-3-border bg-risk-3 text-risk-3-foreground' },
      { label: 'Risk 4', className: 'border-risk-4-border bg-risk-4 text-risk-4-foreground' },
      { label: 'Risk 5', className: 'border-risk-5-border bg-risk-5 text-risk-5-foreground' },
      { label: 'Not rated', className: 'border-rating-unknown-border bg-rating-unknown text-rating-unknown-foreground' },
    ],
  },
  {
    name: 'Impact',
    entries: [
      { label: 'Negligible', className: 'border-impact-negligible-border bg-impact-negligible text-impact-negligible-foreground' },
      { label: 'Moderate', className: 'border-impact-moderate-border bg-impact-moderate text-impact-moderate-foreground' },
      { label: 'Major', className: 'border-impact-major-border bg-impact-major text-impact-major-foreground' },
      { label: 'Severe', className: 'border-impact-severe-border bg-impact-severe text-impact-severe-foreground' },
      { label: 'Omitted', className: 'border-impact-omitted-border bg-impact-omitted text-impact-omitted-foreground' },
    ],
  },
  {
    name: 'Attack feasibility',
    entries: [
      { label: 'Very low', className: 'border-feasibility-very-low-border bg-feasibility-very-low text-feasibility-very-low-foreground' },
      { label: 'Low', className: 'border-feasibility-low-border bg-feasibility-low text-feasibility-low-foreground' },
      { label: 'Medium', className: 'border-feasibility-medium-border bg-feasibility-medium text-feasibility-medium-foreground' },
      { label: 'High', className: 'border-feasibility-high-border bg-feasibility-high text-feasibility-high-foreground' },
    ],
  },
  {
    name: 'Entity types',
    entries: [
      { label: 'Item', className: 'border-entity-item-border bg-entity-item text-entity-item-foreground' },
      { label: 'Asset', className: 'border-entity-asset-border bg-entity-asset text-entity-asset-foreground' },
      { label: 'Damage scenario', className: 'border-entity-damage-border bg-entity-damage text-entity-damage-foreground' },
      { label: 'Threat scenario', className: 'border-entity-threat-border bg-entity-threat text-entity-threat-foreground' },
      { label: 'Attack path', className: 'border-entity-attack-border bg-entity-attack text-entity-attack-foreground' },
    ],
  },
] as const
