import { describe, expect, it } from 'vitest'
import type { ThreatScenarioRiskInputs } from '../../api/models/threatScenario'
import { IMPACT_SCALE } from '../damage-scenarios/impactScale'
import { FEASIBILITY_ORDER, RISK_MATRIX, aggregateFeasibility, calculateRisks } from './riskCalculation'

type Ratings = ThreatScenarioRiskInputs['damageScenarios'][number]['impactRatings']
const cause = { asset: { id: 'a-01', code: 'A-01', name: 'Asset' }, property: 'I' as const }
const ds = (impactRatings: Ratings, targeted = true) => ({ id: 'ds-01', code: 'DS-01', name: 'Damage', targetedCauses: targeted ? [cause] : [], impactRatings })
const rating = (impact_category: Ratings[number]['impact_category'], rating_value: Ratings[number]['rating_value']) => ({ impact_category, rating_value })
const ap = (id: string, feasibility: ThreatScenarioRiskInputs['attackPaths'][number]['feasibility'], isPartial = false) => ({
  id,
  code: id.toUpperCase(),
  name: id,
  feasibility,
  isPartial,
})

const ascending = (values: number[]) => values.toSorted((a, b) => a - b)

describe('RISK_MATRIX', () => {
  // The matrix need not be symmetric, but a higher impact or a more feasible attack must never lower the risk.
  it('never lowers the risk for a higher impact or a more feasible attack', () => {
    const impacts = IMPACT_SCALE.toReversed().map((level) => level.value)
    const rows = impacts.map((impact) => FEASIBILITY_ORDER.map((feasibility) => RISK_MATRIX[impact][feasibility]))
    const columns = FEASIBILITY_ORDER.map((feasibility) => impacts.map((impact) => RISK_MATRIX[impact][feasibility]))

    for (const values of [...rows, ...columns]) expect(values).toEqual(ascending(values))
    expect(Math.min(...rows.flat())).toBe(1)
    expect(Math.max(...rows.flat())).toBe(5)
  })
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
      damageScenarios: [ds([rating('SAFETY', 'SEVERE'), rating('OPERATIONAL', 'MODERATE'), rating('PRIVACY', 'OMITTED')])],
      attackPaths: [ap('ap-01', 'MEDIUM')],
    })

    expect(result.groups[0].rows.map((row) => [row.category, row.state, row.risk])).toEqual([
      ['SAFETY', 'RATED', 4],
      ['FINANCIAL', 'NOT_RATED', null],
      ['OPERATIONAL', 'RATED', 2],
      ['PRIVACY', 'OMITTED', null],
    ])
    expect(result).toMatchObject({ max: 4, missing: null, groups: [{ max: 4, targetedCauses: [cause] }] })
  })

  it('leaves damage scenarios without a target out of the highest risk', () => {
    const untargeted = { ...ds([rating('SAFETY', 'SEVERE')], false), id: 'ds-02', code: 'DS-02' }
    const result = calculateRisks({ damageScenarios: [ds([rating('SAFETY', 'MODERATE')]), untargeted], attackPaths: [ap('ap-01', 'HIGH')] })

    expect(result.groups.map((group) => [group.damageScenario.code, group.counts, group.max])).toEqual([
      ['DS-01', true, 3],
      ['DS-02', false, 5],
    ])
    expect(result.max).toBe(3)
  })

  it('has no highest risk while no category is rated', () => {
    expect(calculateRisks({ damageScenarios: [ds([], false)], attackPaths: [ap('ap-01', 'HIGH')] })).toMatchObject({
      max: null,
      missing: null,
      groups: [{ max: null, targetedCauses: [] }],
    })
  })

  it.each([
    [{ damageScenarios: [], attackPaths: [ap('ap-01', 'HIGH')] }, ['NO_DAMAGE_SCENARIO']],
    [{ damageScenarios: [ds([rating('SAFETY', 'SEVERE')])], attackPaths: [] }, ['NO_ATTACK_PATH']],
    [{ damageScenarios: [ds([rating('SAFETY', 'SEVERE')])], attackPaths: [ap('ap-01', null)] }, ['NO_RATED_ATTACK_PATH']],
    [{ damageScenarios: [], attackPaths: [] }, ['NO_DAMAGE_SCENARIO', 'NO_ATTACK_PATH']],
    [{ damageScenarios: [], attackPaths: [ap('ap-01', null)] }, ['NO_DAMAGE_SCENARIO', 'NO_RATED_ATTACK_PATH']],
  ] as [ThreatScenarioRiskInputs, string[]][])('names everything that is missing for any risk value (%#)', (inputs, missing) => {
    expect(calculateRisks(inputs)).toMatchObject({ max: null, missing })
  })
})
