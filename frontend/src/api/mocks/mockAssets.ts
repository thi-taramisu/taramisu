import { ApiError } from '../errors'
import type { Asset, AssetProperty, AssetRelations, CiaProperty } from '../models/asset'
import type { AssetService } from '../services/assets'
import { renameNodes, run, syncLinks, titleRef, type StoredAsset, type StoredItem } from './mockStore'

const CIA_ORDER: CiaProperty[] = ['C', 'I', 'A']

function toAsset(entry: StoredItem, asset: StoredAsset): Asset {
  return {
    id: asset.id,
    item_definition_id: entry.item.id,
    code: asset.code,
    name: asset.name,
    description: asset.description,
    identification_source: asset.identification_source,
    properties: CIA_ORDER.filter((p) => asset.properties.includes(p)).map((property) => ({
      property,
      description: asset.propertyDescriptions[property] ?? null,
    })),
  }
}

function relationsOf(entry: StoredItem, assetId: string): AssetRelations {
  const links = entry.damageScenarioLinks.filter((link) => link.asset_id === assetId)
  const damageScenarios = entry.damageScenarios.flatMap((ds) => {
    const linkedProperties = CIA_ORDER.filter((p) => links.some((link) => link.damage_scenario_id === ds.id && link.property === p))
    return linkedProperties.length ? [{ ...titleRef(ds), linkedProperties }] : []
  })
  const damageIds = damageScenarios.map((ds) => ds.id)
  const threatScenarios = entry.threatScenarios.flatMap((threat) => {
    const damageScenarioIds = entry.threatDamageLinks
      .filter((link) => link.threat_scenario_id === threat.id && damageIds.includes(link.damage_scenario_id))
      .map((link) => link.damage_scenario_id)
    if (damageScenarioIds.length === 0) return []
    const targetedProperties = CIA_ORDER.filter((p) =>
      entry.threatTargets.some((target) => target.threat_scenario_id === threat.id && target.asset_id === assetId && target.property === p),
    )
    return [{ ...titleRef(threat), targetedProperties, damageScenarioIds }]
  })
  return { damageScenarios, threatScenarios }
}

// Same rules as `asset` (non-blank name) and the UNIQUE constraint of `asset_cybersecurity_property`.
function validate(body: { name?: string; properties?: AssetProperty[] }) {
  if (body.name !== undefined && !body.name.trim()) throw new ApiError(422, 'Name is required.')
  if (body.properties && new Set(body.properties.map((p) => p.property)).size !== body.properties.length) {
    throw new ApiError(422, 'Each property can only be declared once.')
  }
}

/** MOCK: asset service on the stored data of the in-memory item API. */
export function createMockAssetService(db: Map<string, StoredItem>): AssetService {
  function findAsset(projectId: string, assetId: string) {
    for (const entry of db.values()) {
      const asset = entry.assets.find((a) => a.id === assetId)
      if (asset && entry.item.tara_project_id === projectId) return { entry, asset }
    }
    throw new ApiError(404, 'Asset not found.')
  }

  return {
    get: (projectId, assetId) =>
      run(() => {
        const { entry, asset } = findAsset(projectId, assetId)
        return toAsset(entry, asset)
      }),
    update: (projectId, assetId, body) =>
      run(() => {
        const { entry, asset } = findAsset(projectId, assetId)
        validate(body)
        if (body.properties) {
          // The backend would delete the links with the property; the view asks to remove them first.
          const kept = body.properties.map((p) => p.property)
          const used = entry.damageScenarioLinks.find((link) => link.asset_id === asset.id && !kept.includes(link.property))
          if (used) throw new ApiError(409, `Property ${used.property} still leads to a damage scenario.`)
          asset.properties = CIA_ORDER.filter((p) => kept.includes(p))
          asset.propertyDescriptions = Object.fromEntries(body.properties.map((p) => [p.property, p.description]))
        }
        if (body.name !== undefined) asset.name = body.name.trim()
        if (body.description !== undefined) asset.description = body.description
        if (body.identification_source !== undefined) asset.identification_source = body.identification_source
        renameNodes(entry.children, { type: 'assets', id: asset.id, name: asset.name })
        syncLinks(entry)
        return toAsset(entry, asset)
      }),
    relations: (projectId, assetId) =>
      run(() => {
        const { entry, asset } = findAsset(projectId, assetId)
        return relationsOf(entry, asset.id)
      }),
  }
}
