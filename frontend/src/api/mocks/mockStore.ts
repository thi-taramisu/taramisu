import { ApiError } from '../errors'
import type { CiaProperty, ItemAsset } from '../models/asset'
import type { AttackFeasibilityRating, AttackPath } from '../models/attackPath'
import type { DamageScenario, DamageScenarioAssetProperty, ImpactRating } from '../models/damageScenario'
import type { ItemDefinition } from '../models/item'
import type { RiskGroup } from '../models/risk'
import type { ThreatAttackPathLink, ThreatDamageLink, ThreatScenario, ThreatScenarioAssetProperty } from '../models/threatScenario'
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

function threatScenarioNode(entry: StoredItem, threat: ThreatScenario): TreeNode {
  const paths: TreeNode[] = entry.attackPaths
    .filter((path) => entry.threatAttackPathLinks.some((link) => link.threat_scenario_id === threat.id && link.attack_path_id === path.id))
    .map((path) => ({ type: 'attack-paths', id: path.id, code: path.code, name: path.title }))
  return { type: 'threat-scenarios', id: threat.id, code: threat.code, name: threat.title, children: paths.length ? paths : undefined }
}

function damageScenarioNode(entry: StoredItem, scenario: DamageScenario): TreeNode {
  const threats = linkedThreatScenarios(entry, scenario.id).map((threat) => threatScenarioNode(entry, threat))
  return { type: 'damage-scenarios', id: scenario.id, code: scenario.code, name: scenario.title, children: threats.length ? threats : undefined }
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

function isThreatDamageLink(link: ThreatDamageLink, threatScenarioId: string, damageScenarioId: string) {
  return link.threat_scenario_id === threatScenarioId && link.damage_scenario_id === damageScenarioId
}

export function addThreatDamageLink(entry: StoredItem, threatScenarioId: string, damageScenarioId: string) {
  // Same rule as the UNIQUE constraint of `threat_damage_link`.
  if (entry.threatDamageLinks.some((link) => isThreatDamageLink(link, threatScenarioId, damageScenarioId))) {
    throw new ApiError(409, 'The scenarios are already linked.')
  }
  entry.threatDamageLinks.push({ threat_scenario_id: threatScenarioId, damage_scenario_id: damageScenarioId })
  syncLinks(entry)
}

export function removeThreatDamageLink(entry: StoredItem, threatScenarioId: string, damageScenarioId: string) {
  if (!entry.threatDamageLinks.some((link) => isThreatDamageLink(link, threatScenarioId, damageScenarioId))) throw new ApiError(404, 'Link not found.')
  entry.threatDamageLinks = entry.threatDamageLinks.filter((link) => !isThreatDamageLink(link, threatScenarioId, damageScenarioId))
  syncLinks(entry)
}

function isThreatAttackPathLink(link: ThreatAttackPathLink, threatScenarioId: string, attackPathId: string) {
  return link.threat_scenario_id === threatScenarioId && link.attack_path_id === attackPathId
}

export function addThreatAttackPathLink(entry: StoredItem, threatScenarioId: string, attackPathId: string) {
  // Same rule as the UNIQUE constraint of `threat_attack_path_link`.
  if (entry.threatAttackPathLinks.some((link) => isThreatAttackPathLink(link, threatScenarioId, attackPathId))) {
    throw new ApiError(409, 'The attack path is already linked.')
  }
  entry.threatAttackPathLinks.push({ threat_scenario_id: threatScenarioId, attack_path_id: attackPathId })
  syncLinks(entry)
}

export function removeThreatAttackPathLink(entry: StoredItem, threatScenarioId: string, attackPathId: string) {
  if (!entry.threatAttackPathLinks.some((link) => isThreatAttackPathLink(link, threatScenarioId, attackPathId))) throw new ApiError(404, 'Link not found.')
  entry.threatAttackPathLinks = entry.threatAttackPathLinks.filter((link) => !isThreatAttackPathLink(link, threatScenarioId, attackPathId))
  syncLinks(entry)
}

/** Runs `fn` like a request: async, with a copy of the result, errors as rejections. */
export function run<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(structuredClone(fn()))
  } catch (error) {
    return Promise.reject(error)
  }
}
