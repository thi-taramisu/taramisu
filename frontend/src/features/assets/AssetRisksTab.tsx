import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ThreatScenarioRiskInputs } from '../../api/models/threatScenario'
import { useAssetRelations, useThreatScenariosRiskInputs } from '../../api/queries/items'
import { FeasibilityBadge } from '../attack-paths/FeasibilityBadge'
import { CiaProperties, RiskBadge } from '../items/RiskBadge'
import { EntityLink } from '../threat-scenarios/EntityLink'
import { entityPath } from '../workspace/entities'
import { assetRiskRows } from './assetRisks'

/** Risks tab of an asset ("Asset Summary" wireframe): read-only, every damage and threat scenario of the asset with the resulting risk. */
export function AssetRisksTab() {
  const { projectId = '', entityId = '' } = useParams()
  const relations = useAssetRelations(projectId, entityId)
  const threatIds = relations.data?.threatScenarios.map((ts) => ts.id) ?? []
  const inputs = useThreatScenariosRiskInputs(projectId, threatIds)

  if (!relations.data) {
    return relations.isError ? (
      <p role="alert" className="text-sm text-destructive">The risks could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading risks…</output>
    )
  }
  if (relations.data.damageScenarios.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No risks yet. Assets carry no rating of their own; risks appear once a damage scenario of this asset is linked to a rated threat scenario.{' '}
        <Link to={`${entityPath(projectId, 'assets', entityId)}/relations`} className="underline">
          Link a damage scenario on the Relations tab
        </Link>
        .
      </p>
    )
  }

  const loaded = new Map<string, ThreatScenarioRiskInputs>()
  threatIds.forEach((id, i) => {
    const data = inputs[i]?.data
    if (data) loaded.set(id, data)
  })
  const failed = inputs.some((query) => query.isError)
  const rows = assetRiskRows(relations.data, loaded)
  const maxRisk = Math.max(0, ...rows.map((row) => row.risk ?? 0)) || null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          Assets carry no rating of their own. One row per damage scenario × threat scenario; Risk = highest value over the impact categories of
          that damage scenario, as on the threat scenario's Risks tab.
        </p>
        {maxRisk && <RiskBadge value={maxRisk} prefix="max Risk" size="lg" />}
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Some risk values could not be loaded.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Property</TableHead>
            <TableHead>Damage scenario</TableHead>
            <TableHead>Threat scenario</TableHead>
            <TableHead>Feasibility</TableHead>
            <TableHead>Risk</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>
                <CiaProperties properties={row.properties} />
              </TableCell>
              <TableCell>
                <EntityLink projectId={projectId} type="damage-scenarios" entity={row.damageScenario} tab="impact" />
              </TableCell>
              <TableCell>
                {row.threatScenario ? (
                  <>
                    <EntityLink projectId={projectId} type="threat-scenarios" entity={row.threatScenario} tab="risks" />{' '}
                    <Badge variant={row.relation === 'targeted' ? 'default' : 'outline'}>{row.relation}</Badge>
                  </>
                ) : (
                  <span className="text-muted-foreground">No threat scenario linked</span>
                )}
              </TableCell>
              <TableCell>
                {row.feasibility?.feasibility ? (
                  <span className="flex items-center gap-2">
                    <FeasibilityBadge value={row.feasibility.feasibility} withWord={false} size="sm" />
                    {row.feasibility.decisive && <span className="text-xs text-muted-foreground">via {row.feasibility.decisive.code}</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{row.threatScenario ? 'Not rated' : '—'}</span>
                )}
              </TableCell>
              <TableCell>
                <RiskBadge value={row.risk} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
