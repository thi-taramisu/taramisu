import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const { projectId = '', entityId = '' } = useParams()
  const { data: groups, isError } = useItemRisks(projectId, entityId)

  if (!groups) {
    return isError ? (
      <p role="alert" className="text-sm text-destructive">
        {t('ui:loadRisksError')}
      </p>
    ) : (
      <output className="text-sm text-muted-foreground">{t('ui:loadingRisks')}</output>
    )
  }
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        {t('ui:noRisks')}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('ui:risksDescription')}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('ui:property')}</TableHead>
            <TableHead>{t('entities.damage-scenarios')}</TableHead>
            <TableHead>{t('entities.threat-scenarios')}</TableHead>
            <TableHead>{t('ui:feasibility')}</TableHead>
            <TableHead>{t('ui:risk')}</TableHead>
            <TableHead>{t('navigation.tabs.treatment')}</TableHead>
          </TableRow>
        </TableHeader>
        {groups.map(({ asset, rows }) => {
          const maxRisk = Math.max(0, ...rows.map((row) => row.risk ?? 0)) || null
          return (
            <TableBody key={asset.id}>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead scope="rowgroup" colSpan={5} className="text-foreground">
                  <span className="mr-2 text-xs text-muted-foreground uppercase">{t('entities.assets')}</span>
                  <EntityLink projectId={projectId} type="assets" entity={asset} />
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {t('ui:rowCount', { count: rows.length })} · {t('ui:propertiesList', { properties: asset.properties.join(' ') })}
                  </span>
                </TableHead>
                <TableCell className="text-right">{maxRisk && <RiskBadge value={maxRisk} prefix={t('ui:maxRisk')} />}</TableCell>
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
                      <span className="text-muted-foreground">{t('ui:noLinkedDamage')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <EntityLink projectId={projectId} type="threat-scenarios" entity={row.threatScenario} />{' '}
                    <Badge variant={row.relation === 'targeted' ? 'default' : 'outline'}>{t(row.relation === 'targeted' ? 'ui:targetedRelation' : 'ui:viaDamageRelation')}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.feasibility ? (
                      <>
                        {t(`ui:feasibilityValues.${row.feasibility.rating}`, { defaultValue: row.feasibility.rating })} <span className="text-xs text-muted-foreground">{t('ui:via', { path: row.feasibility.attackPath })}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t('ui:notRated')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RiskBadge value={row.risk} />
                  </TableCell>
                  <TableCell>{row.treatment ? t(`ui:treatmentValues.${row.treatment}`, { defaultValue: row.treatment }) : <span className="text-muted-foreground">{t('ui:open')}</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          )
        })}
      </Table>
    </div>
  )
}
