import type { ThreatTarget } from '../../api/models/threatScenario'

export function isSameTarget(a: ThreatTarget, b: ThreatTarget) {
  return a.assetId === b.assetId && a.property === b.property
}

export function hasSameTargets(a: ThreatTarget[], b: ThreatTarget[]) {
  return a.length === b.length && a.every((target) => b.some((other) => isSameTarget(target, other)))
}

/** Selects the target or clears it if it is selected; an asset can have several targeted properties, as in the data model. */
export function toggleTarget(targets: ThreatTarget[], target: ThreatTarget) {
  const others = targets.filter((t) => !isSameTarget(t, target))
  return others.length !== targets.length ? others : [...targets, target]
}
