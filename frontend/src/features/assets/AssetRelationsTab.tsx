import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import type { Asset, AssetRelations } from '../../api/models/asset'
import { useAsset, useAssetRelations, useItemDamageScenarios, useSetAssetDamageLink } from '../../api/queries/items'
import { CiaProperties } from '../items/RiskBadge'
import { ReadOnlyRelationSection } from '../relations/ReadOnlyRelationSection'
import { RelationSection } from '../relations/RelationSection'
import { RelationsQueryStatus } from '../relations/RelationsQueryStatus'
import { formatEntityId } from '../workspace/entities'
import { AssetPropertyToggles } from './AssetPropertyToggles'

/** Relations tab of an asset ("Asset Relation" wireframe): its damage scenarios and the threat scenarios that reach it. */
export function AssetRelationsTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: asset } = useAsset(projectId, entityId)
  if (!asset) return null
  // Remount on asset change so errors of the previous one do not stay.
  return <Relations key={asset.id} projectId={projectId} asset={asset} />
}

function Relations({ projectId, asset }: { projectId: string; asset: Asset }) {
  const { t } = useTranslation()
  const relations = useAssetRelations(projectId, asset.id)
  // Links stay within the item that owns the asset.
  const itemDamageScenarios = useItemDamageScenarios(projectId, asset.item_definition_id)
  const damageLink = useSetAssetDamageLink(projectId, asset.id)

  if (!relations.data) return <RelationsQueryStatus query={relations} />

  const { damageScenarios, threatScenarios } = relations.data
  const properties = asset.properties.map((p) => p.property)
  const targeting = threatScenarios.filter((ts) => ts.targetedProperties.length > 0)
  const viaDamage = threatScenarios.filter((ts) => ts.targetedProperties.length === 0)
  const candidates = itemDamageScenarios.data?.filter((ds) => !damageScenarios.some((linked) => linked.id === ds.id)) ?? []

  return (
    <div className="space-y-4">
      <RelationsQueryStatus query={relations} />
      <RelationSection
        projectId={projectId}
        type="damage-scenarios"
        direction="down"
        title={t('ui:relationDamageTitle')}
        pluralLabel={t('ui:relationDamagePlural')}
        elementLabel={t('entities.damage-scenarios')}
        removeEffect={t('ui:removeLinkWithTargets')}
        // A link needs at least one property, so an asset without any cannot be linked [RQ-15-02].
        candidates={properties.length > 0 ? candidates : []}
        pending={damageLink.isPending}
        candidatesLoading={itemDamageScenarios.isPending}
        candidatesError={
          properties.length === 0
            ? t('ui:assetPage.declarePropertyFirst')
            : itemDamageScenarios.isLoadingError
              ? t('ui:damageScenariosLoadError')
              : undefined
        }
        error={damageLink.isError ? t('ui:saveRelationError') : undefined}
        // New links start with all properties of the asset, as in the create dialog; they are refined in the list.
        onAdd={(damageScenarioId) => damageLink.mutate({ damageScenarioId, properties })}
        onRemove={(damageScenarioId) => damageLink.mutate({ damageScenarioId, properties: [] })}
        rows={damageScenarios.map((ds) => ({
          id: ds.id,
          code: ds.code,
          name: ds.name,
          details: (
            <AssetPropertyToggles
              asset={{ code: ds.code, properties }}
              selected={ds.linkedProperties}
              requireOne
              showUnavailable
              pending={damageLink.isPending}
              onChange={(next) => damageLink.mutate({ damageScenarioId: ds.id, properties: next })}
            />
          ),
        }))}
      />
      <ReadOnlyRelationSection
        projectId={projectId}
        type="threat-scenarios"
        direction="down"
        title={t('ui:assetPage.relationTargetingTitle')}
        hint={t('ui:assetPage.relationTargetingHint')}
        emptyText={t('ui:assetPage.relationTargetingEmpty')}
        rows={targeting.map((ts) => ({ ...ts, details: <CiaProperties properties={ts.targetedProperties} /> }))}
      />
      <ReadOnlyRelationSection
        projectId={projectId}
        type="threat-scenarios"
        direction="down"
        title={t('ui:assetPage.relationViaDamageTitle')}
        hint={t('ui:assetPage.relationViaDamageHint')}
        emptyText={t('ui:assetPage.relationViaDamageEmpty')}
        rows={viaDamage.map((ts) => ({ ...ts, details: <ViaDamage relations={relations.data} damageScenarioIds={ts.damageScenarioIds} /> }))}
      />
      <p className="text-xs text-muted-foreground">{t('ui:assetPage.relationsHint')}</p>
    </div>
  )
}

function ViaDamage({ relations, damageScenarioIds }: { relations: AssetRelations; damageScenarioIds: string[] }) {
  const { t } = useTranslation()
  const codes = relations.damageScenarios.filter((ds) => damageScenarioIds.includes(ds.id)).map((ds) => formatEntityId(ds.code))
  return <span className="text-xs whitespace-nowrap text-muted-foreground">{t('ui:assetPage.viaCodes', { codes: codes.join(', ') })}</span>
}
