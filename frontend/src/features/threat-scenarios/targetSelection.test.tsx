import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ThreatTarget } from '../../api/models/threatScenario'
import { hasSameTargets, toggleTarget } from './targetSelection'
import { ThreatTargetsField } from './ThreatTargetsField'

const integrity: ThreatTarget = { assetId: 'a-01', property: 'I' }
const availability: ThreatTarget = { assetId: 'a-01', property: 'A' }
const otherAsset: ThreatTarget = { assetId: 'a-02', property: 'I' }

describe('toggleTarget', () => {
  it('replaces the target of the same asset with the strict reading, but not of other assets', () => {
    expect(toggleTarget([integrity, otherAsset], availability, 'one-per-asset')).toEqual([otherAsset, availability])
  })

  it('keeps several properties of an asset with the lax reading', () => {
    expect(toggleTarget([integrity], availability, 'several-per-asset')).toEqual([integrity, availability])
  })

  it.each(['one-per-asset', 'several-per-asset'] as const)('clears a selected target with %s', (selection) => {
    expect(toggleTarget([integrity], integrity, selection)).toEqual([])
  })
})

describe('hasSameTargets', () => {
  it('ignores the order', () => {
    expect(hasSameTargets([integrity, otherAsset], [otherAsset, integrity])).toBe(true)
    expect(hasSameTargets([integrity], [availability])).toBe(false)
  })
})

describe('ThreatTargetsField', () => {
  const asset = { id: 'a-01', code: 'A-01', name: 'Command' }
  const damageScenarios = [
    { id: 'ds-01', code: 'DS-01', name: 'Damage', causes: [{ asset, property: 'I' as const }, { asset, property: 'A' as const }] },
  ]

  it('offers checkboxes with the lax reading', () => {
    render(<ThreatTargetsField damageScenarios={damageScenarios} value={[integrity]} onChange={vi.fn<() => void>()} relationsPath="/relations" selection="several-per-asset" />)

    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('offers radio buttons per asset with the strict reading, without an explaining text', () => {
    render(<ThreatTargetsField damageScenarios={damageScenarios} value={[integrity]} onChange={vi.fn<() => void>()} relationsPath="/relations" selection="one-per-asset" />)

    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.queryByText(/Select one property/)).not.toBeInTheDocument()
  })

  it('shows a target from another damage scenario with the strict reading, because choosing here replaces it', () => {
    const other = [{ id: 'ds-02', code: 'DS-02', name: 'Other', causes: [{ asset, property: 'A' as const }] }]
    render(<ThreatTargetsField damageScenarios={other} value={[integrity]} onChange={vi.fn<() => void>()} relationsPath="/relations" selection="one-per-asset" />)

    expect(screen.getByText('Currently: Integrity')).toBeInTheDocument()
  })
})
