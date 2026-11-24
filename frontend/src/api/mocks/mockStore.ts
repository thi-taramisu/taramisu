import { ApiError } from '../errors'
import type { CiaProperty, ItemAsset } from '../models/asset'
import type { AttackFeasibilityRating, AttackPath } from '../models/attackPath'
import type { DamageScenario, DamageScenarioAssetProperty, ImpactRating } from '../models/damageScenario'
import type { ItemDefinition } from '../models/item'
import type { RiskGroup } from '../models/risk'
import type { RiskValue, ThreatAttackPathLink, ThreatDamageLink, ThreatScenario, ThreatScenarioAssetProperty } from '../models/threatScenario'
import type { EntityRef, TreeNode } from '../models/tree'

// MOCK: stored data of the in-memory item API and the helpers its services share.

export interface StoredItem {
  item: ItemDefinition
  children: TreeNode[]
  assets: ItemAsset[]
  risks: RiskGroup[]
  damageScenarios: DamageScenario[]
  damageScenarioLinks: (DamageScenarioAssetProperty & { damage_scenario_id: string })[]
  impactRatings: ImpactRating[]
  threatScenarios: ThreatScenario[]
  threatDamageLinks: ThreatDamageLink[]
  threatTargets: ThreatScenarioAssetProperty[]
  attackPaths: AttackPath[]
  threatAttackPathLinks: ThreatAttackPathLink[]
  attackFeasibilityRatings: AttackFeasibilityRating[]
  /** Risk values as the backend stores them, so their ids stay the same across recalculations. */
  riskValues: RiskValue[]
}

export function validateTitle(title: string | undefined) {
  if (title === undefined) return undefined
  const trimmed = title.trim()
  if (!trimmed) throw new ApiError(422, 'Title is required.')
  return trimmed
}

export function titleRef({ id, code, title }: { id: string; code: string; title: string }): EntityRef {
  return { id, code, name: title }
}

/** Item entry of the project; 404 like the item routes. */
export function findItem(db: Map<string, StoredItem>, projectId: string, itemId: string) {
  const entry = db.get(itemId)
  if (!entry || entry.item.tara_project_id !== projectId) throw new ApiError(404, 'Item definition not found.')
  return entry
}

/** Next display ID such as TS-4, counted over all items of the mock as for the other elements. */
export function nextCode(prefix: 'TS' | 'AP', codes: string[]) {
  return `${prefix}-${Math.max(0, ...codes.map((code) => Number(code.slice(prefix.length + 1)))) + 1}`
}

/** Rejects ids that are not elements of the item or are given twice, as a POST with links would (422). */
export function validateLinkIds(ids: string[], known: { id: string }[], label: string) {
  for (const id of ids) {
    if (!known.some((element) => element.id === id)) throw new ApiError(422, `${label} ${id} is not part of the item.`)
  }
  if (new Set(ids).size !== ids.length) throw new ApiError(422, `Each ${label.toLowerCase()} can only be linked once.`)
}

/** Renames every occurrence of an element in the tree; shared elements appear below several parents. */
export function renameNodes(nodes: TreeNode[], node: Pick<TreeNode, 'type' | 'id' | 'name'>) {
  for (const child of nodes) {
    if (child.type === node.type && child.id === node.id) child.name = node.name
    if (child.children) renameNodes(child.children, node)
  }
}

export function linkedThreatScenarios(entry: StoredItem, damageScenarioId: string) {
  return entry.threatScenarios.filter((threat) =>
    entry.threatDamageLinks.some((link) => link.threat_scenario_id === threat.id && link.damage_scenario_id === damageScenarioId),
  )
}

function attackPathNode(path: AttackPath): TreeNode {
  return { type: 'attack-paths', id: path.id, code: path.code, name: path.title }
}

function threatScenarioNode(entry: StoredItem, threat: ThreatScenario): TreeNode {
  const paths = entry.attackPaths
    .filter((path) => entry.threatAttackPathLinks.some((link) => link.threat_scenario_id === threat.id && link.attack_path_id === path.id))
    .map(attackPathNode)
  return { type: 'threat-scenarios', id: threat.id, code: threat.code, name: threat.title, children: paths.length ? paths : undefined }
}

function damageScenarioNode(entry: StoredItem, scenario: DamageScenario): TreeNode {
  const threats = linkedThreatScenarios(entry, scenario.id).map((threat) => threatScenarioNode(entry, threat))
  return { type: 'damage-scenarios', id: scenario.id, code: scenario.code, name: scenario.title, children: threats.length ? threats : undefined }
}

/**
 * Elements without a link upwards, with the elements below them. Derived from the links on every call,
 * so an element leaves "Unassigned" as soon as it is linked and comes back when its last link is removed.
 */
export function unassignedNodes(entry: StoredItem): TreeNode[] {
  const damageScenarios = entry.damageScenarios.filter((ds) => !entry.damageScenarioLinks.some((link) => link.damage_scenario_id === ds.id))
  const threats = entry.threatScenarios.filter((threat) => !entry.threatDamageLinks.some((link) => link.threat_scenario_id === threat.id))
  const paths = entry.attackPaths.filter((path) => !entry.threatAttackPathLinks.some((link) => link.attack_path_id === path.id))
  return [
    ...damageScenarios.map((ds) => damageScenarioNode(entry, ds)),
    ...threats.map((threat) => threatScenarioNode(entry, threat)),
    ...paths.map(attackPathNode),
  ]
}

/** True if the loss of the asset property leads to a damage scenario linked to the threat scenario. */
export function isThreatCause(entry: StoredItem, threatScenarioId: string, assetId: string, property: CiaProperty) {
  const damageIds = entry.threatDamageLinks.filter((link) => link.threat_scenario_id === threatScenarioId).map((link) => link.damage_scenario_id)
  return entry.damageScenarioLinks.some((link) => damageIds.includes(link.damage_scenario_id) && link.asset_id === assetId && link.property === property)
}

/** Derives the tree below the assets, their counters and the possible targets from the links, after a link changed. */
export function syncLinks(entry: StoredItem) {
  // The targets are chosen among the causes of the linked damage scenarios, so they go together with them.
  entry.threatTargets = entry.threatTargets.filter((target) => isThreatCause(entry, target.threat_scenario_id, target.asset_id, target.property))
  for (const asset of entry.assets) {
    const scenarioIds = new Set(entry.damageScenarioLinks.filter((link) => link.asset_id === asset.id).map((link) => link.damage_scenario_id))
    const threatIds = new Set(entry.threatDamageLinks.filter((link) => scenarioIds.has(link.damage_scenario_id)).map((link) => link.threat_scenario_id))
    asset.damageScenarios = scenarioIds.size
    asset.threatScenarios = threatIds.size
    // Without threat scenarios nothing is rated; the mock cannot recalculate the value when one is linked again.
    if (threatIds.size === 0) asset.maxRisk = null
    const node = entry.children.find((child) => child.type === 'assets' && child.id === asset.id)
    if (!node) continue
    const others = node.children?.filter((child) => child.type !== 'damage-scenarios') ?? []
    const children = [...others, ...entry.damageScenarios.filter((ds) => scenarioIds.has(ds.id)).map((ds) => damageScenarioNode(entry, ds))]
    node.children = children.length ? children : undefined
  }
}

function addLink<Link>(entry: StoredItem, links: Link[], link: Link, isSame: (other: Link) => boolean, conflict: string) {
  if (links.some(isSame)) throw new ApiError(409, conflict)
  links.push(link)
  syncLinks(entry)
}

function removeLink<Link>(entry: StoredItem, links: Link[], isSame: (other: Link) => boolean) {
  const index = links.findIndex(isSame)
  if (index === -1) throw new ApiError(404, 'Link not found.')
  links.splice(index, 1)
  syncLinks(entry)
}

const isThreatDamageLink = (threatScenarioId: string, damageScenarioId: string) => (link: ThreatDamageLink) =>
  link.threat_scenario_id === threatScenarioId && link.damage_scenario_id === damageScenarioId

const isThreatAttackPathLink = (threatScenarioId: string, attackPathId: string) => (link: ThreatAttackPathLink) =>
  link.threat_scenario_id === threatScenarioId && link.attack_path_id === attackPathId

// The conflicts are the same rules as the UNIQUE constraints of `threat_damage_link` and `threat_attack_path_link`.
export function addThreatDamageLink(entry: StoredItem, threatScenarioId: string, damageScenarioId: string) {
  const link = { threat_scenario_id: threatScenarioId, damage_scenario_id: damageScenarioId }
  addLink(entry, entry.threatDamageLinks, link, isThreatDamageLink(threatScenarioId, damageScenarioId), 'The scenarios are already linked.')
}

export function removeThreatDamageLink(entry: StoredItem, threatScenarioId: string, damageScenarioId: string) {
  removeLink(entry, entry.threatDamageLinks, isThreatDamageLink(threatScenarioId, damageScenarioId))
}

export function addThreatAttackPathLink(entry: StoredItem, threatScenarioId: string, attackPathId: string) {
  const link = { threat_scenario_id: threatScenarioId, attack_path_id: attackPathId }
  addLink(entry, entry.threatAttackPathLinks, link, isThreatAttackPathLink(threatScenarioId, attackPathId), 'The attack path is already linked.')
}

export function removeThreatAttackPathLink(entry: StoredItem, threatScenarioId: string, attackPathId: string) {
  removeLink(entry, entry.threatAttackPathLinks, isThreatAttackPathLink(threatScenarioId, attackPathId))
}

/** Runs `fn` like a request: async, with a copy of the result, errors as rejections. */
export function run<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(structuredClone(fn()))
  } catch (error) {
    return Promise.reject(error)
  }
}
