import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ThreatScenarioRisks } from '../../api/models/threatScenario'
import { useAssetRelations, useThreatScenariosRisks } from '../../api/queries/items'
import { FeasibilityBadge } from '../attack-paths/FeasibilityBadge'
import { CiaProperties, RiskBadge } from '../items/RiskBadge'
import { EntityLink } from '../workspace/EntityLink'
import { entityPath, formatEntityId } from '../workspace/entities'
import { assetRiskRows } from './assetRisks'

/** Risks tab of an asset ("Asset Summary" wireframe): read-only, every damage and threat scenario of the asset with the resulting risk. */
export function AssetRisksTab() {
  const { t } = useTranslation()
  const { projectId = '', entityId = '' } = useParams()
  const relations = useAssetRelations(projectId, entityId)
  const threatIds = relations.data?.threatScenarios.map((ts) => ts.id) ?? []
  const risks = useThreatScenariosRisks(projectId, threatIds)

  if (!relations.data) {
    return relations.isError ? (
      <p role="alert" className="text-sm text-destructive">{t('ui:assetPage.risksLoadError')}</p>
    ) : (
      <output className="text-sm text-muted-foreground">{t('ui:loadingRisks')}</output>
    )
  }
  if (relations.data.damageScenarios.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        {t('ui:assetPage.noRisks')}{' '}
        <Link to={`${entityPath(projectId, 'assets', entityId)}/relations`} className="underline">
          {t('ui:assetPage.linkDamageScenario')}
        </Link>
      </p>
    )
  }

  const loaded = new Map<string, ThreatScenarioRisks>()
  // Kept apart from "Not rated": a threat scenario whose risks are still loading may well be rated.
  const pending = new Set<string>()
  threatIds.forEach((id, i) => {
    const data = risks[i]?.data
    if (data) loaded.set(id, data)
    else if (risks[i]?.isPending) pending.add(id)
  })
  const failed = risks.some((query) => query.isError)
  const rows = assetRiskRows(relations.data, loaded)
  const maxRisk = Math.max(0, ...rows.map((row) => row.risk ?? 0)) || null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          {t('ui:assetPage.risksDescription')}
        </p>
        {maxRisk && <RiskBadge value={maxRisk} prefix={t('ui:maxRisk')} size="lg" />}
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('ui:assetPage.someRisksLoadError')}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('ui:property')}</TableHead>
            <TableHead>{t('entities.damage-scenarios')}</TableHead>
            <TableHead>{t('entities.threat-scenarios')}</TableHead>
            <TableHead>{t('ui:feasibility')}</TableHead>
            <TableHead>{t('ui:risk')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const loading = row.threatScenario !== null && pending.has(row.threatScenario.id)
            return (
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
                      <Badge variant={row.relation === 'targeted' ? 'default' : 'outline'}>{t(row.relation === 'targeted' ? 'ui:targetedRelation' : 'ui:viaDamageRelation')}</Badge>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t('ui:assetPage.noThreatLinked')}</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.feasibility?.feasibility ? (
                    <span className="flex items-center gap-2">
                      <FeasibilityBadge value={row.feasibility.feasibility} withWord={false} size="sm" />
                      {row.feasibility.decisive && <span className="text-xs text-muted-foreground">{t('ui:assetPage.viaCodes', { codes: formatEntityId(row.feasibility.decisive.code) })}</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{loading ? t('ui:loading') : row.threatScenario ? t('ui:notRated') : '—'}</span>
                  )}
                </TableCell>
                <TableCell>{loading ? <span className="text-muted-foreground">{t('ui:loading')}</span> : <RiskBadge value={row.risk} />}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
