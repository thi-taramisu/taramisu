import { ApiError } from '../errors'
import type { CiaProperty, ItemAsset } from '../models/asset'
import type { DamageScenario, DamageScenarioAssetProperty, DamageScenarioRelations, ImpactRating, ImpactRatingBody } from '../models/damageScenario'
import { ITEM_NAME_MAX_LENGTH, type ItemDefinition } from '../models/item'
import type { RiskGroup } from '../models/risk'
import type { ThreatDamageLink, ThreatScenario } from '../models/threatScenario'
import type { EntityRef, TreeNode } from '../models/tree'
import type { ItemApi } from '../services/items'
import { exampleProject, headlampAssets, headlampItem, headlampRisks, headlampThreatAttackPaths } from './data/headlamp'
import {
  headlampDamageScenarioLinks,
  headlampDamageScenarios,
  headlampImpactRatings,
  headlampThreatDamageLinks,
  headlampThreatScenarios,
} from './data/headlampDamageScenarios'

// MOCK: in-memory item API. Replace it in `main.tsx` with an implementation on the generated client
// once the item routes (#83) are in `backend/openapi.json`.

interface StoredItem {
  item: ItemDefinition
  children: TreeNode[]
  assets: ItemAsset[]
  risks: RiskGroup[]
  damageScenarios: DamageScenario[]
  damageScenarioLinks: (DamageScenarioAssetProperty & { damage_scenario_id: string })[]
  impactRatings: ImpactRating[]
  threatScenarios: ThreatScenario[]
  threatDamageLinks: ThreatDamageLink[]
  /** Attack paths below a threat scenario in the tree, kept while it has no link. */
  threatAttackPaths: Record<string, TreeNode[]>
}

function seed(): Map<string, StoredItem> {
  const [headlamp] = exampleProject.tree
  const entry = structuredClone({
    item: headlampItem,
    children: headlamp.children ?? [],
    assets: headlampAssets,
    risks: headlampRisks,
    damageScenarios: headlampDamageScenarios,
    damageScenarioLinks: headlampDamageScenarioLinks,
    impactRatings: headlampImpactRatings,
    threatScenarios: headlampThreatScenarios,
    threatDamageLinks: headlampThreatDamageLinks,
    threatAttackPaths: headlampThreatAttackPaths,
  })
  return new Map([[headlampItem.id, entry]])
}

function validateName(name: string | undefined) {
  if (name === undefined) return undefined
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > ITEM_NAME_MAX_LENGTH) {
    throw new ApiError(422, `Name must be 1 to ${ITEM_NAME_MAX_LENGTH} characters.`)
  }
  return trimmed
}

function validateTitle(title: string | undefined) {
  if (title === undefined) return undefined
  const trimmed = title.trim()
  if (!trimmed) throw new ApiError(422, 'Title is required.')
  return trimmed
}

// Same rules as the CHECK and UNIQUE constraints of `impact_rating` in backend/db/schema.sql.
function validateImpactRatings(body: ImpactRatingBody[]) {
  const categories = new Set(body.map((rating) => rating.impact_category))
  if (categories.size !== body.length) throw new ApiError(422, 'Each impact category can only be rated once.')
  for (const rating of body) {
    if (rating.is_omitted_by_pm_15_07 !== (rating.rating_value === 'OMITTED')) {
      throw new ApiError(422, 'is_omitted_by_pm_15_07 must be true exactly for OMITTED ratings.')
    }
    if (rating.reused_from_functional_safety && rating.impact_category !== 'SAFETY') {
      throw new ApiError(422, 'Only safety ratings can be reused from functional safety.')
    }
  }
}

// Same rules as the foreign key and UNIQUE constraint of `damage_scenario_asset_property`, and [RQ-15-02].
function validateAssetProperties(asset: ItemAsset, properties: CiaProperty[]) {
  if (properties.length === 0) throw new ApiError(422, 'A link needs at least one property.')
  if (new Set(properties).size !== properties.length) throw new ApiError(422, 'Each asset property can only be linked once.')
  const missing = properties.find((property) => !asset.properties.includes(property))
  if (missing) throw new ApiError(422, `Asset ${asset.id} has no property ${missing}.`)
}

function threatScenarioRef({ id, code, title }: ThreatScenario): EntityRef {
  return { id, code, name: title }
}

/** Renames every occurrence of an element in the tree; shared elements appear below several parents. */
function renameNodes(nodes: TreeNode[], node: Pick<TreeNode, 'type' | 'id' | 'name'>) {
  for (const child of nodes) {
    if (child.type === node.type && child.id === node.id) child.name = node.name
    if (child.children) renameNodes(child.children, node)
  }
}

function linkedThreatScenarios(entry: StoredItem, damageScenarioId: string) {
  return entry.threatScenarios.filter((threat) =>
    entry.threatDamageLinks.some((link) => link.threat_scenario_id === threat.id && link.damage_scenario_id === damageScenarioId),
  )
}

function damageScenarioNode(entry: StoredItem, scenario: DamageScenario): TreeNode {
  const threats: TreeNode[] = linkedThreatScenarios(entry, scenario.id).map((threat) => ({
    type: 'threat-scenarios',
    id: threat.id,
    code: threat.code,
    name: threat.title,
    children: entry.threatAttackPaths[threat.id],
  }))
  return { type: 'damage-scenarios', id: scenario.id, code: scenario.code, name: scenario.title, children: threats.length ? threats : undefined }
}

/** Derives the tree below the assets and their counters from the links, after a link changed. */
function syncLinks(entry: StoredItem) {
  for (const asset of entry.assets) {
    const scenarioIds = new Set(entry.damageScenarioLinks.filter((link) => link.asset_id === asset.id).map((link) => link.damage_scenario_id))
    const threatIds = new Set(entry.threatDamageLinks.filter((link) => scenarioIds.has(link.damage_scenario_id)).map((link) => link.threat_scenario_id))
    asset.damageScenarios = scenarioIds.size
    asset.threatScenarios = threatIds.size
    const node = entry.children.find((child) => child.type === 'assets' && child.id === asset.id)
    if (!node) continue
    const others = node.children?.filter((child) => child.type !== 'damage-scenarios') ?? []
    const children = [...others, ...entry.damageScenarios.filter((ds) => scenarioIds.has(ds.id)).map((ds) => damageScenarioNode(entry, ds))]
    node.children = children.length ? children : undefined
  }
}

function relationsOf(entry: StoredItem, damageScenarioId: string): DamageScenarioRelations {
  const links = entry.damageScenarioLinks.filter((link) => link.damage_scenario_id === damageScenarioId)
  return {
    assets: entry.assets.flatMap(({ id, code, name, properties }) => {
      const linkedProperties = links.filter((link) => link.asset_id === id).map((link) => link.property)
      return linkedProperties.length ? [{ id, code, name, properties, linkedProperties }] : []
    }),
    threatScenarios: linkedThreatScenarios(entry, damageScenarioId).map(threatScenarioRef),
  }
}

/** Runs `fn` like a request: async, with a copy of the result, errors as rejections. */
function run<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(structuredClone(fn()))
  } catch (error) {
    return Promise.reject(error)
  }
}

/**
 * In-memory implementation of the item API, seeded with the headlamp example. Each call returns
 * copies, so callers cannot change the stored state by accident.
 */
export function createMockItemApi(): ItemApi {
  const db = seed()

  function find(projectId: string, itemId: string) {
    const entry = db.get(itemId)
    if (!entry || entry.item.tara_project_id !== projectId) throw new ApiError(404, 'Item definition not found.')
    return entry
  }

  function findDamageScenario(projectId: string, damageScenarioId: string) {
    for (const entry of db.values()) {
      const scenario = entry.damageScenarios.find((ds) => ds.id === damageScenarioId)
      if (scenario && entry.item.tara_project_id === projectId) return { entry, scenario }
    }
    throw new ApiError(404, 'Damage scenario not found.')
  }

  return {
    items: {
      list: (projectId) =>
        run(() => [...db.values()].map((entry) => entry.item).filter((item) => item.tara_project_id === projectId)),
      get: (projectId, itemId) => run(() => find(projectId, itemId).item),
      create: (projectId, body) =>
        run(() => {
          const item: ItemDefinition = {
            lifecycle_phase: null,
            item_definition_wp_09_01: null,
            cybersecurity_specs_wp_10_01: null,
            architectural_design: null,
            boundary: null,
            functions: null,
            operational_environment: null,
            ...body,
            name: validateName(body.name)!,
            id: crypto.randomUUID(),
            tara_project_id: projectId,
            created_at: new Date().toISOString(),
          }
          db.set(item.id, {
            item,
            children: [],
            assets: [],
            risks: [],
            damageScenarios: [],
            damageScenarioLinks: [],
            impactRatings: [],
            threatScenarios: [],
            threatDamageLinks: [],
            threatAttackPaths: {},
          })
          return item
        }),
      update: (projectId, itemId, body) =>
        run(() => {
          const entry = find(projectId, itemId)
          const name = validateName(body.name)
          entry.item = { ...entry.item, ...body, ...(name === undefined ? {} : { name }) }
          return entry.item
        }),
      // Deletes the elements below the item too; the backend has to cascade the same way.
      delete: (projectId, itemId) =>
        run(() => {
          find(projectId, itemId)
          db.delete(itemId)
        }),
    },
    content: {
      children: (projectId, itemId) => run(() => find(projectId, itemId).children),
      assets: (projectId, itemId) => run(() => find(projectId, itemId).assets),
      addAsset: (projectId, itemId, newAsset) =>
        run(() => {
          const entry = find(projectId, itemId)
          const codes = [...db.values()].flatMap((e) => e.assets.map((a) => Number(a.code.slice(2))))
          const code = `A-${String(Math.max(0, ...codes) + 1).padStart(2, '0')}`
          const asset: ItemAsset = { ...newAsset, id: crypto.randomUUID(), code, damageScenarios: 0, threatScenarios: 0, maxRisk: null }
          entry.assets.push(asset)
          entry.children.push({ type: 'assets', id: asset.id, code, name: asset.name })
          return asset
        }),
      risks: (projectId, itemId) => run(() => find(projectId, itemId).risks),
      threatScenarios: (projectId, itemId) => run(() => find(projectId, itemId).threatScenarios.map(threatScenarioRef)),
    },
    damageScenarios: {
      create: (projectId, body) =>
        run(() => {
          const entry = find(projectId, body.item_definition_id)
          for (const { asset_id, property } of body.asset_properties) {
            if (!entry.assets.some((asset) => asset.id === asset_id && asset.properties.includes(property))) {
              throw new ApiError(422, `Asset ${asset_id} of the item has no property ${property}.`)
            }
          }
          // Same rule as the UNIQUE constraint of `damage_scenario_asset_property` in backend/db/schema.sql.
          const pairs = new Set(body.asset_properties.map(({ asset_id, property }) => `${asset_id}:${property}`))
          if (pairs.size !== body.asset_properties.length) throw new ApiError(422, 'Each asset property can only be linked once.')
          const codes = [...db.values()].flatMap((e) => e.damageScenarios.map((ds) => Number(ds.code.slice(3))))
          const scenario: DamageScenario = {
            id: crypto.randomUUID(),
            item_definition_id: entry.item.id,
            code: `DS-${String(Math.max(0, ...codes) + 1).padStart(2, '0')}`,
            title: validateTitle(body.title)!,
            functionality_adverse_relation: null,
            road_user_harm_description: null,
          }
          entry.damageScenarios.push(scenario)
          entry.damageScenarioLinks.push(...body.asset_properties.map((link) => ({ ...link, damage_scenario_id: scenario.id })))
          // Below each linked asset in the tree, as a shared element can have several parents.
          for (const assetId of new Set(body.asset_properties.map((link) => link.asset_id))) {
            const asset = entry.assets.find((a) => a.id === assetId)!
            asset.damageScenarios += 1
            const node = entry.children.find((child) => child.type === 'assets' && child.id === assetId)
            if (node) node.children = [...(node.children ?? []), { type: 'damage-scenarios', id: scenario.id, code: scenario.code, name: scenario.title }]
          }
          return scenario
        }),
      get: (projectId, damageScenarioId) => run(() => findDamageScenario(projectId, damageScenarioId).scenario),
      update: (projectId, damageScenarioId, body) =>
        run(() => {
          const { entry, scenario } = findDamageScenario(projectId, damageScenarioId)
          const title = validateTitle(body.title)
          Object.assign(scenario, body, title === undefined ? {} : { title })
          renameNodes(entry.children, { type: 'damage-scenarios', id: scenario.id, name: scenario.title })
          return scenario
        }),
      impactRatings: (projectId, damageScenarioId) =>
        run(() => {
          const { entry, scenario } = findDamageScenario(projectId, damageScenarioId)
          return entry.impactRatings.filter((rating) => rating.damage_scenario_id === scenario.id)
        }),
      updateImpactRatings: (projectId, damageScenarioId, body) =>
        run(() => {
          const { entry, scenario } = findDamageScenario(projectId, damageScenarioId)
          validateImpactRatings(body)
          for (const rating of body) {
            const stored = entry.impactRatings.find(
              (r) => r.damage_scenario_id === scenario.id && r.impact_category === rating.impact_category,
            )
            if (stored) Object.assign(stored, rating)
            else entry.impactRatings.push({ ...rating, id: crypto.randomUUID(), damage_scenario_id: scenario.id })
          }
          return entry.impactRatings.filter((r) => r.damage_scenario_id === scenario.id)
        }),
      relations: (projectId, damageScenarioId) =>
        run(() => {
          const { entry, scenario } = findDamageScenario(projectId, damageScenarioId)
          return relationsOf(entry, scenario.id)
        }),
      linkAsset: (projectId, damageScenarioId, assetId, properties) =>
        run(() => {
          const { entry, scenario } = findDamageScenario(projectId, damageScenarioId)
          const asset = entry.assets.find((a) => a.id === assetId)
          // Scenarios and assets belong to one item, so assets of other items are not found.
          if (!asset) throw new ApiError(404, 'Asset not found.')
          validateAssetProperties(asset, properties)
          entry.damageScenarioLinks = entry.damageScenarioLinks.filter((link) => link.damage_scenario_id !== scenario.id || link.asset_id !== asset.id)
          entry.damageScenarioLinks.push(...properties.map((property) => ({ damage_scenario_id: scenario.id, asset_id: asset.id, property })))
          syncLinks(entry)
          return relationsOf(entry, scenario.id)
        }),
      unlinkAsset: (projectId, damageScenarioId, assetId) =>
        run(() => {
          const { entry, scenario } = findDamageScenario(projectId, damageScenarioId)
          const isLink = (link: StoredItem['damageScenarioLinks'][number]) => link.damage_scenario_id === scenario.id && link.asset_id === assetId
          if (!entry.damageScenarioLinks.some(isLink)) throw new ApiError(404, 'Link not found.')
          entry.damageScenarioLinks = entry.damageScenarioLinks.filter((link) => !isLink(link))
          syncLinks(entry)
          return relationsOf(entry, scenario.id)
        }),
      linkThreatScenario: (projectId, damageScenarioId, threatScenarioId) =>
        run(() => {
          const { entry, scenario } = findDamageScenario(projectId, damageScenarioId)
          if (!entry.threatScenarios.some((threat) => threat.id === threatScenarioId)) throw new ApiError(404, 'Threat scenario not found.')
          // Same rule as the UNIQUE constraint of `threat_damage_link`.
          if (entry.threatDamageLinks.some((link) => link.threat_scenario_id === threatScenarioId && link.damage_scenario_id === scenario.id)) {
            throw new ApiError(409, 'The threat scenario is already linked.')
          }
          entry.threatDamageLinks.push({ threat_scenario_id: threatScenarioId, damage_scenario_id: scenario.id })
          syncLinks(entry)
          return relationsOf(entry, scenario.id)
        }),
      unlinkThreatScenario: (projectId, damageScenarioId, threatScenarioId) =>
        run(() => {
          const { entry, scenario } = findDamageScenario(projectId, damageScenarioId)
          const isLink = (link: ThreatDamageLink) => link.threat_scenario_id === threatScenarioId && link.damage_scenario_id === scenario.id
          if (!entry.threatDamageLinks.some(isLink)) throw new ApiError(404, 'Link not found.')
          entry.threatDamageLinks = entry.threatDamageLinks.filter((link) => !isLink(link))
          syncLinks(entry)
          return relationsOf(entry, scenario.id)
        }),
    },
  }
}
