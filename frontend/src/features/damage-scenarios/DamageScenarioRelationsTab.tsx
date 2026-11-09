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
import { LINK_REMOVE_WITH_TARGETS, LINK_SAVE_ERROR } from '../relations/messages'
import { RelationSection } from '../relations/RelationSection'
import { RelationsQueryStatus } from '../relations/RelationsQueryStatus'


/** Relations tab of a damage scenario ("DS Relation" wireframe): the assets leading to it and its threat scenarios. */
export function DamageScenarioRelationsTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: scenario } = useDamageScenario(projectId, entityId)
  if (!scenario) return null
  // Remount on damage scenario change so errors of the previous one do not stay.
  return <Relations key={scenario.id} projectId={projectId} scenario={scenario} />
}

function Relations({ projectId, scenario }: { projectId: string; scenario: DamageScenario }) {
  const relations = useDamageScenarioRelations(projectId, scenario.id)
  // Links stay within the item that owns the damage scenario.
  const itemAssets = useItemAssets(projectId, scenario.item_definition_id)
  const itemThreats = useItemThreatScenarios(projectId, scenario.item_definition_id)
  const assetLink = useSetDamageScenarioAssetLink(projectId, scenario.id)
  const threatLink = useSetDamageScenarioThreatLink(projectId, scenario.id)

  if (!relations.data) return <RelationsQueryStatus query={relations} />

  const { assets, threatScenarios: threats } = relations.data
  // A link needs at least one property, so assets without any cannot be linked.
  const assetCandidates = itemAssets.data?.filter((asset) => asset.properties.length > 0 && !assets.some((a) => a.id === asset.id)) ?? []
  const threatCandidates = itemThreats.data?.filter((threat) => !threats.some((t) => t.id === threat.id)) ?? []

  return (
    <div className="space-y-4">
      <RelationsQueryStatus query={relations} />
      <RelationSection
        projectId={projectId}
        type="assets"
        direction="up"
        title="Assets"
        elementLabel="Asset"
        removeEffect={LINK_REMOVE_WITH_TARGETS}
        candidates={assetCandidates.map((asset) => ({ ...asset, details: <CiaProperties properties={asset.properties} /> }))}
        pending={assetLink.isPending}
        candidatesLoading={itemAssets.isPending}
        candidatesError={itemAssets.isLoadingError ? 'The assets of this item could not be loaded.' : undefined}
        error={assetLink.isError ? LINK_SAVE_ERROR : undefined}
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
              pending={assetLink.isPending}
              onChange={(properties) => assetLink.mutate({ assetId: asset.id, properties })}
            />
          ),
        }))}
      />
      <RelationSection
        projectId={projectId}
        type="threat-scenarios"
        direction="down"
        title="Threat Scenarios"
        elementLabel="Threat Scenario"
        removeEffect={LINK_REMOVE_WITH_TARGETS}
        candidates={threatCandidates}
        pending={threatLink.isPending}
        candidatesLoading={itemThreats.isPending}
        candidatesError={itemThreats.isLoadingError ? 'The threat scenarios of this item could not be loaded.' : undefined}
        error={threatLink.isError ? LINK_SAVE_ERROR : undefined}
        onAdd={(threatScenarioId) => threatLink.mutate({ threatScenarioId, linked: true })}
        onRemove={(threatScenarioId) => threatLink.mutate({ threatScenarioId, linked: false })}
        rows={threats}
      />
      <p className="text-xs text-muted-foreground">
        Removing a link does not delete the element. Damage and threat scenarios without links are no longer shown in the tree. An asset link needs at least one property.
      </p>
    </div>
  )
}
