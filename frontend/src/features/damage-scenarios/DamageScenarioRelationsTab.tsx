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
import { RelationSection } from '../relations/RelationSection'

const SAVE_ERROR = 'The link could not be saved. Please try again.'

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

  if (!relations.data) {
    return relations.isError ? (
      <p role="alert" className="text-sm text-destructive">The relations could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading relations…</output>
    )
  }

  const { assets, threatScenarios: threats } = relations.data
  // A link needs at least one property, so assets without any cannot be linked.
  const assetCandidates = itemAssets.data?.filter((asset) => asset.properties.length > 0 && !assets.some((a) => a.id === asset.id)) ?? []
  const threatCandidates = itemThreats.data?.filter((threat) => !threats.some((t) => t.id === threat.id)) ?? []

  return (
    <div className="space-y-4">
      {relations.isError && (
        <p role="alert" className="text-sm text-destructive">The relations could not be refreshed.</p>
      )}
      <RelationSection
        projectId={projectId}
        type="assets"
        title="Assets"
        addLabel="Add Asset"
        candidates={assetCandidates}
        pending={assetLink.isPending}
        error={assetLink.isError ? SAVE_ERROR : itemAssets.isError ? 'The assets of the item could not be loaded.' : undefined}
        // New links start with all properties of the asset, as in the create dialog.
        onAdd={(assetId) => {
          const properties = assetCandidates.find((asset) => asset.id === assetId)?.properties ?? []
          assetLink.mutate({ assetId, properties })
        }}
        onRemove={(assetId) => assetLink.mutate({ assetId, properties: [] })}
        rows={assets.map((asset) => ({
          id: asset.id,
          code: asset.code,
          name: asset.name,
          // The tree has no place for unlinked damage scenarios yet, so it would disappear from it.
          removeDisabled: assets.length === 1,
          details: (
            <AssetPropertyToggles
              asset={asset}
              selected={asset.linkedProperties}
              requireOne
              pending={assetLink.isPending}
              onChange={(properties) => assetLink.mutate({ assetId: asset.id, properties })}
            />
          ),
        }))}
      />
      <RelationSection
        projectId={projectId}
        type="threat-scenarios"
        title="Threat Scenarios"
        addLabel="Add Threat Scenario"
        candidates={threatCandidates}
        pending={threatLink.isPending}
        error={threatLink.isError ? SAVE_ERROR : itemThreats.isError ? 'The threat scenarios of the item could not be loaded.' : undefined}
        onAdd={(threatScenarioId) => threatLink.mutate({ threatScenarioId, linked: true })}
        onRemove={(threatScenarioId) => threatLink.mutate({ threatScenarioId, linked: false })}
        rows={threats}
      />
      <p className="text-xs text-muted-foreground">
        Removing a link never deletes an element. A damage scenario keeps at least one asset, and each asset link at least one property.
      </p>
    </div>
  )
}
