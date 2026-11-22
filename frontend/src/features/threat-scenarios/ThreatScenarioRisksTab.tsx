import { useId } from 'react'
import { ChevronDown, Pencil, TriangleAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ThreatScenarioRisks } from '../../api/models/threatScenario'
import { useThreatScenarioRisks } from '../../api/queries/items'
import { FEASIBILITY, FEASIBILITY_DOT_CLASSES } from '../attack-paths/attackFeasibility'
import { FeasibilityBadge } from '../attack-paths/FeasibilityBadge'
import { IMPACT_DOT_CLASSES, categoryLabel, impactLabel } from '../damage-scenarios/impactScale'
import { RiskBadge } from '../items/RiskBadge'
import { RISK_DOT_CLASSES, riskBadgeClasses } from '../items/riskClasses'
import { entityPath } from '../workspace/entities'
import { EntityLink } from '../workspace/EntityLink'
import { RiskMatrix } from './RiskMatrix'
import { isRated, riskView, type RatedFeasibility, type RatedRiskRow, type RiskBlocker, type RiskResult } from './riskView'
import { formatEntityId } from '../workspace/entities'

/** Risks tab of a threat scenario ("TS Risks" wireframe): the risk values from impact and attack feasibility. */
export function ThreatScenarioRisksTab() {
  const { projectId = '', entityId = '' } = useParams()
  const risks = useThreatScenarioRisks(projectId, entityId)

  if (!risks.data) {
    return risks.isError ? (
      <p role="alert" className="text-sm text-destructive">The risks could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading risks…</output>
    )
  }
  const result = riskView(risks.data)
  return result.missing === null ? (
    <RiskValues projectId={projectId} threatScenarioId={entityId} result={result} />
  ) : (
    <Blocked projectId={projectId} threatScenarioId={entityId} missing={result.missing} risks={risks.data} />
  )
}

type RiskValuesResult = Extract<RiskResult, { missing: null }>

function RiskValues({ projectId, threatScenarioId, result }: { projectId: string; threatScenarioId: string; result: RiskValuesResult }) {
  const { feasibility } = result
  const { decisive } = feasibility
  // Only damage scenarios that a target leads to count for the risk of the threat scenario.
  const rated = result.groups.filter((group) => group.counts).flatMap((group) => group.rows).filter(isRated)
  const tops = rated.filter((row) => row.risk === result.max)
  const top = tops[0]
  // The rows with the highest value are only marked while it stands out from lower ones.
  const highest = rated.some((row) => row.risk !== result.max) ? result.max : null

  return (
    <div className="max-w-4xl space-y-4">
      {/* What applies to all risk values of the threat scenario comes first. */}
      <section aria-labelledby="risk-overview" className="overflow-hidden rounded-lg border">
        <h2 id="risk-overview" className="sr-only">
          Risk overview
        </h2>
        <dl className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="grid gap-2 px-4 py-3">
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Attack Feasibility</dt>
            <dd className="flex flex-wrap items-center gap-2 text-sm">
              <FeasibilityBadge value={feasibility.feasibility} withWord={false} />
              <span className="text-muted-foreground">via {formatEntityId(decisive.code)}</span>
            </dd>
          </div>
          <div className="grid gap-2 px-4 py-3">
            {/* The same dot as on the rows with this value, so the overview explains it. */}
            <dt className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {top && highest !== null && <HighestDot risk={top.risk} />}
              Highest Risk
            </dt>
            <dd className="flex flex-wrap items-center gap-2 text-sm">
              {top ? (
                <>
                  <RiskBadge value={top.risk} size="lg" />
                  <span className="text-muted-foreground">
                    in {formatEntityId(top.damageScenario.code)} · {categoryLabel(top.category)}
                    {tops.length > 1 && ` and ${tops.length - 1} more`}
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
          highest={group.counts ? highest : null}
        />
      ))}
    </div>
  )
}

interface DamageScenarioRisksProps {
  projectId: string
  threatScenarioId: string
  group: RiskResult['groups'][number]
  feasibility: RatedFeasibility
  /** Highest risk of the threat scenario, marked on its rows; null while all risk values are equal. */
  highest: number | null
}

/** One linked damage scenario: a risk value per rated impact category, then the unrated categories; omitted ones in one line. */
function DamageScenarioRisks({ projectId, threatScenarioId, group, feasibility, highest }: DamageScenarioRisksProps) {
  const headingId = useId()
  const rated = group.rows.filter(isRated)
  const notRated = group.rows.filter((row) => row.state === 'NOT_RATED')
  const omitted = group.rows.filter((row) => row.state === 'OMITTED')
  const impactPath = `${entityPath(projectId, 'damage-scenarios', group.damageScenario.id)}/impact`

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/50 px-4 py-2">
        {/* A minimum width, so on narrow screens the maximum wraps below the title instead of squeezing it. */}
        <div className="min-w-48 flex-1">
          <h3 id={headingId} className="text-sm font-medium">
            {/* Plain text: the pens in the rows lead to where the damage scenario is rated. */}
            <span className="font-mono text-xs text-muted-foreground">{formatEntityId(group.damageScenario.code)}</span> {group.damageScenario.name}
          </h3>
        </div>
        {group.max !== null && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            max. <RiskBadge value={group.max} />
          </span>
        )}
      </div>
      {/* Shown as text, not only on hover, so it can be read on touch screens too. */}
      {group.targetedCauses.length === 0 && (
        <p className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          <span>
            None of the targets of this threat scenario leads to this damage scenario, so its risk values do not count for the threat scenario.{' '}
            <Link to={entityPath(projectId, 'threat-scenarios', threatScenarioId)} className="underline">
              Check the targets
            </Link>
          </span>
        </p>
      )}
      {/* A table, so screen readers announce the column of each value: each row reads "impact and feasibility → risk". */}
      <Table>
        <caption className="sr-only">Risk values per impact category</caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {['Category', 'Impact', 'Feasibility', 'Risk'].map((label) => (
              <TableHead key={label} scope="col" className={cn('h-8 w-32 text-[11px] tracking-wide text-muted-foreground uppercase', label === 'Category' && 'pl-4')}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rated.map((row) => {
            const isHighest = row.risk === highest
            const category = categoryLabel(row.category)
            return (
              <TableRow key={row.key}>
                <TableHead scope="row" className="pl-4 font-medium">
                  {category}
                </TableHead>
                {/* The inputs are plain values; the pen opens where they are rated. */}
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${IMPACT_DOT_CLASSES[row.impact]}`} />
                    <span>
                      {impactLabel(row.impact)} <span className="sr-only">impact</span>
                    </span>
                    <EditLink to={impactPath} label={`Edit the ${category} impact on the Impact tab of ${formatEntityId(row.damageScenario.code)}`} />
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${FEASIBILITY_DOT_CLASSES[feasibility.feasibility]}`} />
                    <span>
                      {FEASIBILITY[feasibility.feasibility].label} <span className="sr-only">feasibility</span>
                    </span>
                    <EditLink
                      to={`${entityPath(projectId, 'attack-paths', feasibility.decisive.id)}/rating`}
                      label={`Edit the rating of ${formatEntityId(feasibility.decisive.code)}, the most feasible attack path`}
                    />
                  </span>
                </TableCell>
                <TableCell className="pr-4">
                  <span className="flex items-center gap-1.5">
                    <RiskCalculationPopover row={row} feasibility={feasibility} isHighest={isHighest} />
                    {/* The dot of "Highest Risk" in the overview marks the rows with that value. */}
                    {isHighest && (
                      <span title="Highest risk of the threat scenario" className="flex items-center">
                        <HighestDot risk={row.risk} />
                        <span className="sr-only">Highest</span>
                      </span>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
          {/* Unrated categories stay in their place, so nothing open is hidden. */}
          {notRated.map((row) => {
            const category = categoryLabel(row.category)
            return (
              <TableRow key={row.key} className="text-muted-foreground hover:bg-transparent">
                <TableHead scope="row" className="pl-4 font-normal text-muted-foreground">
                  {category}
                </TableHead>
                <TableCell colSpan={3}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full border border-dashed border-muted-foreground" />
                    Not rated
                    <EditLink to={impactPath} label={`Rate the ${category} impact on the Impact tab of ${formatEntityId(row.damageScenario.code)}`} />
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {/* Omitted categories are a justified decision [PM-15-07], so they only get a line at the end. */}
      {omitted.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          <span>Omitted:</span>
          {omitted.map((row) => (
            <span key={row.key} className="inline-flex h-5 items-center rounded-full bg-muted px-2">
              {categoryLabel(row.category)}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

/** Dot in the colour of a risk value that marks the highest risk of the threat scenario. */
function HighestDot({ risk }: { risk: number }) {
  return <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', RISK_DOT_CLASSES[risk])} />
}

/** Small grey pen that opens the tab where a value is rated. */
function EditLink({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="icon-xs" className="text-muted-foreground">
      <Link to={to} aria-label={label} title={label}>
        <Pencil aria-hidden="true" />
      </Link>
    </Button>
  )
}

/** The risk value opens its lookup in the risk matrix, in a popover, so the table stays one line per category. */
function RiskCalculationPopover({ row, feasibility, isHighest }: { row: RatedRiskRow; feasibility: RatedFeasibility; isHighest: boolean }) {
  return (
    <Popover>
      {/* The badge itself is the button; the chevron inside it shows that it opens. */}
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Risk ${row.risk}${isHighest ? ', highest' : ''}, calculation of ${formatEntityId(row.damageScenario.code)} ${categoryLabel(row.category)}`}
          title="Show the calculation"
          className={cn(
            riskBadgeClasses(row.risk),
            'group cursor-pointer gap-0.5 pr-1 tabular-nums outline-none transition-shadow hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:ring-2 data-[state=open]:ring-ring/40',
          )}
        >
          {row.risk}
          <ChevronDown aria-hidden="true" className="size-3 opacity-70 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      {/* The title is short, so the dialog's name says which risk value it explains. */}
      <PopoverContent align="start" aria-label={`Calculation of ${formatEntityId(row.damageScenario.code)} ${categoryLabel(row.category)}`} className="w-auto gap-2 p-3">
        <PopoverHeader>
          <PopoverTitle>Calculation</PopoverTitle>
        </PopoverHeader>
        <RiskMatrix impact={row.impact} feasibility={feasibility.feasibility} />
      </PopoverContent>
    </Popover>
  )
}

/** What the risk values still depend on: attack paths that can change the feasibility. */
function RiskNotes({ projectId, result }: { projectId: string; result: RiskResult }) {
  const { feasibility, decisive } = result.feasibility
  // A rating can only raise the feasibility, so unrated paths no longer matter once it is High.
  const unrated = feasibility === 'HIGH' ? [] : result.feasibility.unrated
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
  missing: RiskBlocker[]
  risks: ThreatScenarioRisks
}

const MISSING_MESSAGES: Record<RiskBlocker, string> = {
  NO_DAMAGE_SCENARIO: 'No damage scenario is linked yet.',
  NO_ATTACK_PATH: 'No attack path is linked yet.',
  NO_RATED_ATTACK_PATH: 'None of the linked attack paths is rated yet.',
}

/** Says everything that is missing for any risk value and where to add it. */
function Blocked({ projectId, threatScenarioId, missing, risks }: BlockedProps) {
  const unlinked = missing.filter((item) => item !== 'NO_RATED_ATTACK_PATH')

  return (
    <div className="max-w-3xl space-y-2 rounded-lg border border-dashed p-6 text-sm">
      <p className="font-medium">No risk values yet.</p>
      <ul aria-label="Missing for risk values" className="grid gap-1">
        {missing.map((item) => (
          <li key={item}>{MISSING_MESSAGES[item]}</li>
        ))}
      </ul>
      {missing.includes('NO_RATED_ATTACK_PATH') && (
        <ul className="grid gap-1">
          {risks.attackPaths.map((path) => (
            <li key={path.id}>
              Rate <EntityLink projectId={projectId} type="attack-paths" entity={path} tab="rating" />
            </li>
          ))}
        </ul>
      )}
      {unlinked.length > 0 && (
        <Link to={`${entityPath(projectId, 'threat-scenarios', threatScenarioId)}/relations`} className="inline-block underline">
          Link {unlinked.length > 1 ? 'them' : 'it'} on the Relations tab
        </Link>
      )}
    </div>
  )
}
