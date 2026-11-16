import type { ThreatTarget } from '../../api/models/threatScenario'

export type TargetSelection = 'one-per-asset' | 'several-per-asset'

/**
 * How RQ-15-03 is read. The team follows "several-per-asset", as the data model does (section 2.3). "one-per-asset" is the
 * strict reading of the wireframe concept, where a threat compromising several properties of an asset is split into several
 * threat scenarios; this is the only place to change if that is ever needed.
 */
export const TARGET_SELECTION: TargetSelection = 'several-per-asset'

export function isSameTarget(a: ThreatTarget, b: ThreatTarget) {
  return a.assetId === b.assetId && a.property === b.property
}

export function hasSameTargets(a: ThreatTarget[], b: ThreatTarget[]) {
  return a.length === b.length && a.every((target) => b.some((other) => isSameTarget(target, other)))
}

/** Selects the target or clears it if it is selected; with one per asset it replaces the asset's other target. */
export function toggleTarget(targets: ThreatTarget[], target: ThreatTarget, selection: TargetSelection) {
  const others = targets.filter((t) => !isSameTarget(t, target))
  if (others.length !== targets.length) return others
  return [...(selection === 'one-per-asset' ? others.filter((t) => t.assetId !== target.assetId) : others), target]
}
