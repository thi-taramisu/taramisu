import { ApiError } from '../errors'
import type { ItemAsset } from '../models/asset'
import type { DamageScenario, ImpactRating, ImpactRatingBody } from '../models/damageScenario'
import { ITEM_NAME_MAX_LENGTH, type ItemDefinition } from '../models/item'
import type { RiskGroup } from '../models/risk'
import type { TreeNode } from '../models/tree'
import type { ItemApi } from '../services/items'
import { exampleProject, headlampAssets, headlampItem, headlampRisks } from './data/headlamp'
import { headlampDamageScenarios, headlampImpactRatings } from './data/headlampDamageScenarios'

// MOCK: in-memory item API. Replace it in `main.tsx` with an implementation on the generated client
// once the item routes (#83) are in `backend/openapi.json`.

interface StoredItem {
  item: ItemDefinition
  children: TreeNode[]
  assets: ItemAsset[]
  risks: RiskGroup[]
  damageScenarios: DamageScenario[]
  impactRatings: ImpactRating[]
}

function seed(): Map<string, StoredItem> {
  const [headlamp] = exampleProject.tree
  const entry = structuredClone({
    item: headlampItem,
    children: headlamp.children ?? [],
    assets: headlampAssets,
    risks: headlampRisks,
    damageScenarios: headlampDamageScenarios,
    impactRatings: headlampImpactRatings,
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

/** Renames every occurrence of an element in the tree; shared elements appear below several parents. */
function renameNodes(nodes: TreeNode[], node: Pick<TreeNode, 'type' | 'id' | 'name'>) {
  for (const child of nodes) {
    if (child.type === node.type && child.id === node.id) child.name = node.name
    if (child.children) renameNodes(child.children, node)
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
          db.set(item.id, { item, children: [], assets: [], risks: [], damageScenarios: [], impactRatings: [] })
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
    },
    damageScenarios: {
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
    },
  }
}
