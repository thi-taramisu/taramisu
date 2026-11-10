import { useId, useState } from 'react'
import { ArrowRight, ChevronDown, TriangleAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ThreatScenarioRiskInputs } from '../../api/models/threatScenario'
import { useThreatScenarioRiskInputs } from '../../api/queries/items'
import { FEASIBILITY } from '../attack-paths/attackFeasibility'
import { FeasibilityBadge } from '../attack-paths/FeasibilityBadge'
import { CIA_PROPERTIES } from '../assets/ciaProperties'
import { IMPACT_CLASSES, categoryLabel, impactLabel } from '../damage-scenarios/impactScale'
import { RiskBadge } from '../items/RiskBadge'
import { entityPath } from '../workspace/entities'
import { RiskCalculationDetails } from './RiskCalculationDetails'
import { calculateRisks, type RiskBlocker, type RiskResult, type RiskRow } from './riskCalculation'
import { EntityLink } from './EntityLink'

/** Risks tab of a threat scenario ("TS Risks" wireframe): the risk values from impact and attack feasibility. */
export function ThreatScenarioRisksTab() {
  const { projectId = '', entityId = '' } = useParams()
  const inputs = useThreatScenarioRiskInputs(projectId, entityId)

  if (!inputs.data) {
    return inputs.isError ? (
      <p role="alert" className="text-sm text-destructive">The risks could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading risks…</output>
    )
  }
  const result = calculateRisks(inputs.data)
  return result.blocker ? (
    <Blocked projectId={projectId} threatScenarioId={entityId} blocker={result.blocker} inputs={inputs.data} />
  ) : (
    <RiskValues projectId={projectId} threatScenarioId={entityId} result={result} />
  )
}

type RatedRow = RiskRow & { impact: NonNullable<RiskRow['impact']>; risk: number }
const isRated = (row: RiskRow): row is RatedRow => row.risk !== null
type Feasibility = RiskResult['feasibility'] & { feasibility: NonNullable<RiskResult['feasibility']['feasibility']> }

function RiskValues({ projectId, threatScenarioId, result }: { projectId: string; threatScenarioId: string; result: RiskResult }) {
  const feasibility = { ...result.feasibility, feasibility: result.feasibility.feasibility! }
  const { decisive } = feasibility
  const rated = result.groups.flatMap((group) => group.rows).filter(isRated)
  const top = rated.reduce<RatedRow | null>((best, row) => (!best || row.risk > best.risk ? row : best), null)
  // One calculation at a time, so the page stays short and the open one is easy to find.
  const [openKey, setOpenKey] = useState<string | null>(null)

  return (
    <div className="max-w-4xl space-y-4">
      {/* What applies to all risk values of the threat scenario comes first. */}
      <section aria-labelledby="risk-overview" className="overflow-hidden rounded-lg border">
        <h2 id="risk-overview" className="sr-only">
          Risk overview
        </h2>
        <dl className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="grid gap-2 px-4 py-3">
            <dt className="text-xs text-muted-foreground uppercase">Attack Feasibility</dt>
            <dd className="flex flex-wrap items-center gap-2 text-sm">
              <FeasibilityBadge value={feasibility.feasibility} withWord={false} />
              {decisive && (
                <Link to={`${entityPath(projectId, 'attack-paths', decisive.id)}/rating`} className="text-muted-foreground hover:underline">
                  via {decisive.code}
                </Link>
              )}
            </dd>
          </div>
          <div className="grid gap-2 px-4 py-3">
            <dt className="text-xs text-muted-foreground uppercase">Highest Risk</dt>
            <dd className="flex flex-wrap items-center gap-2 text-sm">
              {top ? (
                <>
                  <RiskBadge value={top.risk} size="lg" />
                  <span className="text-muted-foreground">
                    in {top.damageScenario.code} · {categoryLabel(top.category)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Not determined yet</span>
              )}
            </dd>
          </div>
        </dl>
        <RiskNotes projectId={projectId} result={result} />
      </section>
      {result.groups.map((group) => (
        <DamageScenarioRisks
          key={group.damageScenario.id}
          projectId={projectId}
          threatScenarioId={threatScenarioId}
          group={group}
          feasibility={feasibility}
          highest={result.max}
          openKey={openKey}
          onOpenChange={(key, open) => setOpenKey(open ? key : null)}
        />
      ))}
    </div>
  )
}

interface DamageScenarioRisksProps {
  projectId: string
  threatScenarioId: string
  group: RiskResult['groups'][number]
  feasibility: Feasibility
  /** Highest risk of the threat scenario, marked on its rows. */
  highest: number | null
  openKey: string | null
  onOpenChange: (key: string, open: boolean) => void
}

/** One linked damage scenario: a risk value per rated impact category, the other categories in one line. */
function DamageScenarioRisks({ projectId, threatScenarioId, group, feasibility, highest, openKey, onOpenChange }: DamageScenarioRisksProps) {
  const headingId = useId()
  const rated = group.rows.filter(isRated)
  const notRated = group.rows.filter((row) => row.state === 'NOT_RATED')
  const omitted = group.rows.filter((row) => row.state === 'OMITTED')
  const impactPath = `${entityPath(projectId, 'damage-scenarios', group.damageScenario.id)}/impact`

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/50 px-4 py-2">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-sm font-medium">
            <EntityLink projectId={projectId} type="damage-scenarios" entity={group.damageScenario} />
          </h3>
          {/* The targeted asset properties are why the damage scenario belongs to this threat; they do not enter the risk value. */}
          {group.targetedCauses.length > 0 && (
            <p className="text-xs text-muted-foreground">
              via{' '}
              {group.targetedCauses.map((cause, index) => (
                <span key={`${cause.asset.id}:${cause.property}`}>
                  {index > 0 && ', '}
                  <span className="font-mono">{cause.asset.code}</span> {cause.asset.name} · {CIA_PROPERTIES.find((p) => p.value === cause.property)?.label}
                </span>
              ))}
            </p>
          )}
        </div>
        {group.targetedCauses.length === 0 && (
          <Link to={entityPath(projectId, 'threat-scenarios', threatScenarioId)} title="None of the targets of this threat scenario leads to this damage scenario.">
            <Badge variant="outline">No target</Badge>
          </Link>
        )}
        {group.max !== null && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            Max <RiskBadge value={group.max} />
          </span>
        )}
      </div>
      <>
          {/* Column labels for the rows: each one reads "impact × feasibility → risk". */}
          <div aria-hidden="true" className="flex gap-x-4 px-4 pt-2 text-xs text-muted-foreground">
            <span className="w-28">Category</span>
            <span className="w-24 text-center">Impact</span>
            <span className="w-2" />
            <span className="w-24 text-center">Feasibility</span>
            <span className="w-3.5" />
            <span>Risk</span>
          </div>
        <ul className="divide-y">
          {rated.map((row) => {
            const isHighest = row.risk === highest
            return (
            <Collapsible key={row.key} asChild open={openKey === row.key} onOpenChange={(open) => onOpenChange(row.key, open)}>
              <li
                className={cn('px-4 py-2', isHighest && 'bg-muted/40')}
                // An accent in the colour of the risk value marks the row that decides the risk of the threat scenario.
                style={isHighest ? { boxShadow: `inset 3px 0 0 var(--risk-${row.risk}-border)` } : undefined}
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="w-28 font-medium">{categoryLabel(row.category)}</span>
                  {/* The inputs link to where they are rated and differ in shape from the result. */}
                  <Link
                    to={impactPath}
                    title={`Rated on the Impact tab of ${row.damageScenario.code}`}
                    className={`inline-flex h-6 w-24 items-center justify-center rounded-md border text-xs hover:underline ${IMPACT_CLASSES[row.impact]}`}
                  >
                    {impactLabel(row.impact)}{' '}
                    <span className="sr-only">impact</span>
                  </Link>
                  <span aria-hidden="true" className="w-2 text-center text-muted-foreground">
                    ×
                  </span>
                  {feasibility.decisive && (
                    <Link
                      to={`${entityPath(projectId, 'attack-paths', feasibility.decisive.id)}/rating`}
                      title={`Rated on the Rating tab of ${feasibility.decisive.code}, the most feasible attack path`}
                      className={`inline-flex h-6 w-24 items-center justify-center rounded-md border text-xs hover:underline ${FEASIBILITY[feasibility.feasibility].classes}`}
                    >
                      {FEASIBILITY[feasibility.feasibility].label}{' '}
                      <span className="sr-only">feasibility</span>
                    </Link>
                  )}
                  <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  <RiskBadge value={row.risk} />
                  {isHighest && <span className="text-xs font-medium text-muted-foreground">Highest</span>}
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="group ml-auto text-muted-foreground">
                      <span className="sr-only">
                        {row.damageScenario.code} {categoryLabel(row.category)}
                      </span>{' '}
                      Calculation
                      <ChevronDown aria-hidden="true" data-icon="inline-end" className="transition-transform group-data-[state=open]:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="pt-2">
                  <RiskCalculationDetails projectId={projectId} row={row} feasibility={feasibility} />
                </CollapsibleContent>
              </li>
            </Collapsible>
            )
          })}
          {/* Categories without a risk value stay in their place, so nothing open is hidden. */}
          {[...notRated, ...omitted].map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-muted/20 px-4 py-1.5 text-sm text-muted-foreground">
              <span className="w-28">{categoryLabel(row.category)}</span>
              {row.state === 'NOT_RATED' ? (
                <>
                  <Link
                    to={impactPath}
                    className="inline-flex h-6 w-24 items-center justify-center rounded-md border border-dashed border-foreground/30 text-xs text-foreground hover:bg-muted"
                  >
                    Not rated
                  </Link>
                  <span className="text-xs">Rate it on the Impact tab to get a risk value.</span>
                </>
              ) : (
                <>
                  <span className="inline-flex h-6 w-24 items-center justify-center rounded-md border border-impact-omitted-border bg-impact-omitted text-xs text-impact-omitted-foreground">
                    Omitted
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs" title={row.rationale ?? undefined}>
                    {row.rationale ?? 'No rationale given.'}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </>
    </section>
  )
}

/** What the risk values still depend on: attack paths that can change the feasibility. */
function RiskNotes({ projectId, result }: { projectId: string; result: RiskResult }) {
  const { decisive, unrated } = result.feasibility
  if (unrated.length === 0 && !decisive?.isPartial) return null

  return (
    <ul aria-label="Notes on the risk values" className="grid gap-1 border-t bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
      {decisive?.isPartial && (
        <li className="flex items-center gap-2">
          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          <span>
            <EntityLink projectId={projectId} type="attack-paths" entity={decisive} /> is a partial attack path, so the feasibility can still change.
          </span>
        </li>
      )}
      {unrated.map((path) => (
        <li key={path.id} className="flex items-center gap-2">
          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          <span>
            <EntityLink projectId={projectId} type="attack-paths" entity={path} tab="rating" /> is not rated yet and can raise the feasibility.
          </span>
        </li>
      ))}
    </ul>
  )
}

interface BlockedProps {
  projectId: string
  threatScenarioId: string
  blocker: RiskBlocker
  inputs: ThreatScenarioRiskInputs
}

/** Says what is missing for any risk value and where to add it. */
function Blocked({ projectId, threatScenarioId, blocker, inputs }: BlockedProps) {
  const message: Record<RiskBlocker, string> = {
    NO_DAMAGE_SCENARIO: 'No damage scenario is linked yet.',
    NO_ATTACK_PATH: 'No attack path is linked yet.',
    NO_RATED_ATTACK_PATH: 'None of the linked attack paths is rated yet.',
  }

  return (
    <div className="max-w-3xl space-y-2 rounded-lg border border-dashed p-6 text-sm">
      <p>
        <span className="font-medium">No risk values yet.</span> {message[blocker]}
      </p>
      {blocker === 'NO_RATED_ATTACK_PATH' ? (
        <ul className="grid gap-1">
          {inputs.attackPaths.map((path) => (
            <li key={path.id}>
              Rate <EntityLink projectId={projectId} type="attack-paths" entity={path} tab="rating" />
            </li>
          ))}
        </ul>
      ) : (
        <Link to={`${entityPath(projectId, 'threat-scenarios', threatScenarioId)}/relations`} className="underline">
          Link it on the Relations tab
        </Link>
      )}
    </div>
  )
}
