import { describe, expect, it } from 'vitest'
import type { ThreatScenarioRiskInputs } from '../../api/models/threatScenario'
import { aggregateFeasibility, calculateRisks } from './riskCalculation'

type Ratings = ThreatScenarioRiskInputs['damageScenarios'][number]['impactRatings']
const cause = { asset: { id: 'a-01', code: 'A-01', name: 'Asset' }, property: 'I' as const }
const ds = (impactRatings: Ratings, targeted = true) => ({ id: 'ds-01', code: 'DS-01', name: 'Damage', targetedCauses: targeted ? [cause] : [], impactRatings })
const rating = (impact_category: Ratings[number]['impact_category'], rating_value: Ratings[number]['rating_value'], rationale: string | null = null) => ({
  impact_category,
  rating_value,
  omission_or_rating_rationale: rationale,
})
const ap = (id: string, feasibility: ThreatScenarioRiskInputs['attackPaths'][number]['feasibility'], isPartial = false) => ({
  id,
  code: id.toUpperCase(),
  name: id,
  feasibility,
  isPartial,
})

describe('aggregateFeasibility', () => {
  it('takes the most feasible rated attack path and lists the unrated ones', () => {
    const result = aggregateFeasibility([ap('ap-01', 'LOW'), ap('ap-02', 'HIGH', true), ap('ap-03', null)])

    expect(result).toMatchObject({ feasibility: 'HIGH', decisive: { id: 'ap-02', isPartial: true }, rated: 2 })
    expect(result.unrated.map((path) => path.id)).toEqual(['ap-03'])
  })

  it('has no feasibility without a rated attack path', () => {
    expect(aggregateFeasibility([ap('ap-01', null)])).toMatchObject({ feasibility: null, decisive: null, rated: 0 })
  })
})

describe('calculateRisks', () => {
  it('rates every category and keeps omitted and unrated ones apart', () => {
    const result = calculateRisks({
      damageScenarios: [ds([rating('SAFETY', 'SEVERE'), rating('OPERATIONAL', 'MODERATE'), rating('PRIVACY', 'OMITTED', 'No personal data')])],
      attackPaths: [ap('ap-01', 'MEDIUM')],
    })

    expect(result.groups[0].rows.map((row) => [row.category, row.state, row.risk])).toEqual([
      ['SAFETY', 'RATED', 4],
      ['FINANCIAL', 'NOT_RATED', null],
      ['OPERATIONAL', 'RATED', 2],
      ['PRIVACY', 'OMITTED', null],
    ])
    expect(result.groups[0].rows[3].rationale).toBe('No personal data')
    expect(result).toMatchObject({ max: 4, blocker: null, groups: [{ max: 4, targetedCauses: [cause] }] })
  })

  it('has no highest risk while no category is rated', () => {
    expect(calculateRisks({ damageScenarios: [ds([], false)], attackPaths: [ap('ap-01', 'HIGH')] })).toMatchObject({
      max: null,
      blocker: null,
      groups: [{ max: null, targetedCauses: [] }],
    })
  })

  it.each([
    [{ damageScenarios: [], attackPaths: [ap('ap-01', 'HIGH')] }, 'NO_DAMAGE_SCENARIO'],
    [{ damageScenarios: [ds([rating('SAFETY', 'SEVERE')])], attackPaths: [] }, 'NO_ATTACK_PATH'],
    [{ damageScenarios: [ds([rating('SAFETY', 'SEVERE')])], attackPaths: [ap('ap-01', null)] }, 'NO_RATED_ATTACK_PATH'],
  ] as [ThreatScenarioRiskInputs, string][])('names what is missing for any risk value (%#)', (inputs, blocker) => {
    expect(calculateRisks(inputs)).toMatchObject({ max: null, blocker })
  })
})
