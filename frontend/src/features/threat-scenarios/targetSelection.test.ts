import { describe, expect, it } from 'vitest'
import type { ThreatTarget } from '../../api/models/threatScenario'
import { hasSameTargets, toggleTarget } from './targetSelection'

const integrity: ThreatTarget = { assetId: 'a-01', property: 'I' }
const availability: ThreatTarget = { assetId: 'a-01', property: 'A' }
const otherAsset: ThreatTarget = { assetId: 'a-02', property: 'I' }

describe('toggleTarget', () => {
  it('keeps several properties of an asset', () => {
    expect(toggleTarget([integrity], availability)).toEqual([integrity, availability])
  })

  it('clears a selected target', () => {
    expect(toggleTarget([integrity, availability], integrity)).toEqual([availability])
  })
})

describe('hasSameTargets', () => {
  it('ignores the order', () => {
    expect(hasSameTargets([integrity, otherAsset], [otherAsset, integrity])).toBe(true)
    expect(hasSameTargets([integrity], [availability])).toBe(false)
  })
})
