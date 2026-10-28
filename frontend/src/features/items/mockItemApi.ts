import { headlampAssets, headlampRisks } from '../assets/headlampAssets'
import { exampleProject } from '../workspace/exampleProject'
import type { TreeNode } from '../workspace/entities'
import {
  ApiError,
  ITEM_NAME_MAX_LENGTH,
  type ItemApi,
  type ItemAsset,
  type ItemDefinition,
  type RiskGroup,
} from './itemApi'

interface StoredItem {
  item: ItemDefinition
  children: TreeNode[]
  assets: ItemAsset[]
  risks: RiskGroup[]
}

function seed(): Map<string, StoredItem> {
  const [headlamp] = exampleProject.tree
  const item: ItemDefinition = {
    id: headlamp.id,
    tara_project_id: exampleProject.id,
    name: headlamp.name,
    scope_type: 'ITEM',
    lifecycle_phase: 'Concept',
    item_definition_wp_09_01: null,
    cybersecurity_specs_wp_10_01: null,
    architectural_design: null,
    boundary: 'Headlamp system incl. body control ECU, power switch actuator and lamps. Gateway ECU, camera ECU and navigation ECU are outside the boundary.',
    functions: 'Switch low and high beam on driver request; automatic high beam based on camera data.',
    operational_environment: 'Passenger car at day and night; vehicle CAN bus behind the gateway; workshop diagnostics via OBD-II.',
    created_at: '2026-10-01T08:00:00Z',
  }
  const entry = structuredClone({ item, children: headlamp.children ?? [], assets: headlampAssets, risks: headlampRisks })
  return new Map([[item.id, entry]])
}

function validateName(name: string | undefined) {
  if (name === undefined) return undefined
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > ITEM_NAME_MAX_LENGTH) {
    throw new ApiError(422, `Name must be 1 to ${ITEM_NAME_MAX_LENGTH} characters.`)
  }
  return trimmed
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
          db.set(item.id, { item, children: [], assets: [], risks: [] })
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
  }
}
