import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { EntityRef, EntityType } from '../../api/models/tree'
import { useItemRisks } from '../../api/queries/items'
import { entityPath } from '../workspace/entities'
import { RiskBadge } from './RiskBadge'

function EntityLink({ projectId, type, entity }: { projectId: string; type: EntityType; entity: EntityRef }) {
  return (
    <Link to={entityPath(projectId, type, entity.id)} className="hover:underline">
      <span className="font-mono text-xs text-muted-foreground">{entity.code}</span> {entity.name}
    </Link>
  )
}

/** Risks tab of an item ("Item Summary" wireframe): read-only, one row per asset × damage × threat. */
export function ItemRisksTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: groups, isError } = useItemRisks(projectId, entityId)

  if (!groups) {
    return isError ? (
      <p role="alert" className="text-sm text-destructive">
        The risks could not be loaded.
      </p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading risks…</output>
    )
  }
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No risks yet. Risks appear once threat scenarios are linked to the item's assets and rated.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        One row per asset × damage scenario × threat scenario. Risk = highest value over the impact categories of that damage scenario.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Property</TableHead>
            <TableHead>Damage scenario</TableHead>
            <TableHead>Threat scenario</TableHead>
            <TableHead>Feasibility</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Treatment</TableHead>
          </TableRow>
        </TableHeader>
        {groups.map(({ asset, rows }) => {
          const maxRisk = Math.max(0, ...rows.map((row) => row.risk ?? 0)) || null
          return (
            <TableBody key={asset.id}>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead scope="rowgroup" colSpan={5} className="text-foreground">
                  <span className="mr-2 text-xs text-muted-foreground uppercase">Asset</span>
                  <EntityLink projectId={projectId} type="assets" entity={asset} />
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {rows.length} {rows.length === 1 ? 'row' : 'rows'} · properties {asset.properties.join(' ')}
                  </span>
                </TableHead>
                <TableCell className="text-right">{maxRisk && <RiskBadge value={maxRisk} prefix="max Risk" />}</TableCell>
              </TableRow>
              {rows.map((row) => (
                <TableRow key={`${row.property}/${row.damageScenario?.id}/${row.threatScenario.id}`}>
                  <TableCell className="font-mono text-xs">{row.property}</TableCell>
                  <TableCell>
                    {row.damageScenario ? (
                      <>
                        <EntityLink projectId={projectId} type="damage-scenarios" entity={row.damageScenario} />{' '}
                        <span className="text-xs text-muted-foreground">{row.damageScenario.impact}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">no damage scenario linked</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <EntityLink projectId={projectId} type="threat-scenarios" entity={row.threatScenario} />{' '}
                    <Badge variant={row.relation === 'targeted' ? 'default' : 'outline'}>{row.relation}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.feasibility ? (
                      <>
                        {row.feasibility.rating} <span className="text-xs text-muted-foreground">via {row.feasibility.attackPath}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not rated</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RiskBadge value={row.risk} />
                  </TableCell>
                  <TableCell>{row.treatment ?? <span className="text-muted-foreground">Open</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          )
        })}
      </Table>
    </div>
  )
}
