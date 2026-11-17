import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import type { DamageScenario } from '../../api/models/damageScenario'
import {
  useDamageScenario,
  useDamageScenarioRelations,
  useItemAssets,
  useItemThreatScenarios,
  useSetDamageScenarioAssetLink,
  useSetDamageScenarioThreatLink,
} from '../../api/queries/items'
import { AssetPropertyToggles } from '../assets/AssetPropertyToggles'
import { CiaProperties } from '../items/RiskBadge'
import { RelationSection } from '../relations/RelationSection'

/** Relations tab of a damage scenario ("DS Relation" wireframe): the assets leading to it and its threat scenarios. */
export function DamageScenarioRelationsTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: scenario } = useDamageScenario(projectId, entityId)
  if (!scenario) return null
  // Remount on damage scenario change so errors of the previous one do not stay.
  return <Relations key={scenario.id} projectId={projectId} scenario={scenario} />
}

function Relations({ projectId, scenario }: { projectId: string; scenario: DamageScenario }) {
  const { t } = useTranslation()
  const relations = useDamageScenarioRelations(projectId, scenario.id)
  // Links stay within the item that owns the damage scenario.
  const itemAssets = useItemAssets(projectId, scenario.item_definition_id)
  const itemThreats = useItemThreatScenarios(projectId, scenario.item_definition_id)
  const assetLink = useSetDamageScenarioAssetLink(projectId, scenario.id)
  const threatLink = useSetDamageScenarioThreatLink(projectId, scenario.id)
  // Both write the full relations into the cache, so only one may run at a time; otherwise an older response could overwrite a newer one.
  const saving = assetLink.isPending || threatLink.isPending

  if (!relations.data) {
    return relations.isError ? (
      <p role="alert" className="text-sm text-destructive">{t('ui:loadRelationsError')}</p>
    ) : (
      <output className="text-sm text-muted-foreground">{t('ui:loadingRelations')}</output>
    )
  }

  const { assets, threatScenarios: threats } = relations.data
  // A link needs at least one property, so assets without any cannot be linked.
  const assetCandidates = itemAssets.data?.filter((asset) => asset.properties.length > 0 && !assets.some((a) => a.id === asset.id)) ?? []
  const threatCandidates = itemThreats.data?.filter((threat) => !threats.some((linkedThreat) => linkedThreat.id === threat.id)) ?? []

  return (
    <div className="space-y-4">
      {relations.isError && (
        <p role="alert" className="text-sm text-destructive">{t('ui:refreshRelationsError')}</p>
      )}
      <RelationSection
        projectId={projectId}
        type="assets"
        direction="up"
        title={t('ui:relationAssetsTitle')}
        pluralLabel={t('ui:relationAssetsPlural')}
        elementLabel={t('entities.assets')}
        candidates={assetCandidates.map((asset) => ({ ...asset, details: <CiaProperties properties={asset.properties} /> }))}
        removeEffect={t('ui:removeLinkWithTargets')}
        pending={saving}
        candidatesLoading={itemAssets.isPending}
        candidatesError={itemAssets.isLoadingError ? t('ui:loadItemAssetsError') : undefined}
        error={assetLink.isError ? t('ui:saveRelationError') : undefined}
        // New links start with all properties of the asset, as in the create dialog; they are refined in the table.
        onAdd={(assetId) => {
          const properties = assetCandidates.find((asset) => asset.id === assetId)?.properties ?? []
          assetLink.mutate({ assetId, properties })
        }}
        onRemove={(assetId) => assetLink.mutate({ assetId, properties: [] })}
        rows={assets.map((asset) => ({
          id: asset.id,
          code: asset.code,
          name: asset.name,
          details: (
            <AssetPropertyToggles
              asset={asset}
              selected={asset.linkedProperties}
              requireOne
              showUnavailable
              pending={saving}
              onChange={(properties) => assetLink.mutate({ assetId: asset.id, properties })}
            />
          ),
        }))}
      />
      <RelationSection
        projectId={projectId}
        type="threat-scenarios"
        direction="down"
        title={t('ui:relationThreatsTitle')}
        pluralLabel={t('ui:relationThreatsPlural')}
        elementLabel={t('entities.threat-scenarios')}
        candidates={threatCandidates}
        removeEffect={t('ui:removeLinkWithTargets')}
        pending={saving}
        candidatesLoading={itemThreats.isPending}
        candidatesError={itemThreats.isLoadingError ? t('ui:loadItemThreatsError') : undefined}
        error={threatLink.isError ? t('ui:saveRelationError') : undefined}
        onAdd={(threatScenarioId) => threatLink.mutate({ threatScenarioId, linked: true })}
        onRemove={(threatScenarioId) => threatLink.mutate({ threatScenarioId, linked: false })}
        rows={threats}
      />
      <p className="text-xs text-muted-foreground">
        {t('ui:relationsHint')}
      </p>
    </div>
  )
}
