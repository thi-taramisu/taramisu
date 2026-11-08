import { useState } from 'react'
import { useParams } from 'react-router-dom'
import type { CiaProperty } from '../../api/models/asset'
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
import { CIA_PROPERTIES } from '../assets/ciaProperties'
import { RelationSection } from '../relations/RelationSection'

const SAVE_ERROR = 'The link could not be changed. Please try again.'
const ALL_PROPERTIES = CIA_PROPERTIES.map((p) => p.value)

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
  const [newLinkProperties, setNewLinkProperties] = useState<CiaProperty[]>(ALL_PROPERTIES)

  if (!relations.data) {
    return relations.isError ? (
      <p role="alert" className="text-sm text-destructive">The relations could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading relations…</output>
    )
  }

  const { assets, threatScenarios: threats } = relations.data
  // A link can only use properties the asset has, so assets without any of the chosen ones cannot be linked.
  const linkableProperties = (properties: CiaProperty[]) => properties.filter((property) => newLinkProperties.includes(property))
  const assetCandidates = itemAssets.data?.filter((asset) => linkableProperties(asset.properties).length > 0 && !assets.some((a) => a.id === asset.id)) ?? []
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
        elementLabel="Asset"
        candidates={assetCandidates}
        pending={assetLink.isPending}
        error={assetLink.isError ? SAVE_ERROR : itemAssets.isError ? 'The assets of this item could not be loaded.' : undefined}
        addFields={
          <div className="flex items-center gap-3">
            <span className="font-medium">Cybersecurity Properties</span>
            <AssetPropertyToggles asset={{ code: 'New link', properties: ALL_PROPERTIES }} selected={newLinkProperties} requireOne onChange={setNewLinkProperties} />
          </div>
        }
        onAdd={(assetId) => {
          const properties = linkableProperties(assetCandidates.find((asset) => asset.id === assetId)?.properties ?? [])
          assetLink.mutate({ assetId, properties })
          setNewLinkProperties(ALL_PROPERTIES)
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
        elementLabel="Threat Scenario"
        candidates={threatCandidates}
        pending={threatLink.isPending}
        error={threatLink.isError ? SAVE_ERROR : itemThreats.isError ? 'The threat scenarios of this item could not be loaded.' : undefined}
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
