import { useParams } from 'react-router-dom'
import type { Asset, AssetRelations } from '../../api/models/asset'
import { useAsset, useAssetRelations, useItemDamageScenarios, useSetAssetDamageLink } from '../../api/queries/items'
import { CiaProperties } from '../items/RiskBadge'
import { LINK_REMOVE_WITH_TARGETS, LINK_SAVE_ERROR } from '../relations/messages'
import { ReadOnlyRelationSection } from '../relations/ReadOnlyRelationSection'
import { RelationSection } from '../relations/RelationSection'
import { RelationsQueryStatus } from '../relations/RelationsQueryStatus'
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
        title="Damage Scenarios"
        elementLabel="Damage Scenario"
        removeEffect={LINK_REMOVE_WITH_TARGETS}
        // A link needs at least one property, so an asset without any cannot be linked [RQ-15-02].
        candidates={properties.length > 0 ? candidates : []}
        pending={damageLink.isPending}
        candidatesLoading={itemDamageScenarios.isPending}
        candidatesError={
          properties.length === 0
            ? 'Declare a cybersecurity property on the Definition tab first.'
            : itemDamageScenarios.isLoadingError
              ? 'The damage scenarios of this item could not be loaded.'
              : undefined
        }
        error={damageLink.isError ? LINK_SAVE_ERROR : undefined}
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
        title="Threat Scenarios Targeting It"
        hint="targeted property, chosen on the threat scenario's Definition tab (RQ-15-03)"
        emptyText="No threat scenario targets this asset yet."
        rows={targeting.map((ts) => ({ ...ts, details: <CiaProperties properties={ts.targetedProperties} /> }))}
      />
      <ReadOnlyRelationSection
        projectId={projectId}
        type="threat-scenarios"
        direction="down"
        title="Threat Scenarios Affecting It via Damage"
        hint="derived from the linked damage scenarios"
        emptyText="No other threat scenario leads to a damage scenario of this asset."
        rows={viaDamage.map((ts) => ({ ...ts, details: <ViaDamage relations={relations.data} damageScenarioIds={ts.damageScenarioIds} /> }))}
      />
      <p className="text-xs text-muted-foreground">
        Removing a link does not delete the element. A link needs at least one property. Threat scenarios reach the asset through its damage
        scenarios and are linked on their Relations tab.
      </p>
    </div>
  )
}

function ViaDamage({ relations, damageScenarioIds }: { relations: AssetRelations; damageScenarioIds: string[] }) {
  const codes = relations.damageScenarios.filter((ds) => damageScenarioIds.includes(ds.id)).map((ds) => ds.code)
  return <span className="text-xs whitespace-nowrap text-muted-foreground">via {codes.join(', ')}</span>
}
