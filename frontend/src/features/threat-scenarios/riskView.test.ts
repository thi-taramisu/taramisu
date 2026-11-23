import { describe, expect, it } from 'vitest'
import type { ThreatScenarioRisks } from '../../api/models/threatScenario'
import { riskView } from './riskView'

type Ratings = ThreatScenarioRisks['damageScenarios'][number]['impactRatings']
const cause = { asset: { id: 'a-01', code: 'AS-1', name: 'Asset' }, property: 'I' as const }
const ds = (id: string, impactRatings: Ratings, targeted = true) => ({ id, code: id.toUpperCase().replace(/-0+(?=\d)/, '-'), name: 'Damage', targetedCauses: targeted ? [cause] : [], impactRatings })
const rating = (id: string, impact_category: Ratings[number]['impact_category'], rating_value: Ratings[number]['rating_value']) => ({ id, impact_category, rating_value })
const ap = (id: string, feasibility: ThreatScenarioRisks['attackPaths'][number]['feasibility'], isPartial = false) => ({
  id,
  code: id.toUpperCase().replace(/-0+(?=\d)/, '-'),
  name: id,
  feasibility,
  isPartial,
})
const riskValue = (impact_rating_id: string, risk_score: number) => ({
  id: `rv-${impact_rating_id}`,
  threat_scenario_id: 'ts-01',
  version: 1,
  impact_rating_id,
  risk_score,
  determination_method: 'RISK_MATRIX' as const,
})

describe('riskView', () => {
  it('shows the risk values of the backend and keeps omitted and unrated categories apart', () => {
    const result = riskView({
      damageScenarios: [ds('ds-01', [rating('ir-1', 'SAFETY', 'SEVERE'), rating('ir-2', 'OPERATIONAL', 'MODERATE'), rating('ir-3', 'PRIVACY', 'OMITTED')])],
      attackPaths: [ap('ap-01', 'MEDIUM')],
      feasibility: { rating: 'MEDIUM', attackPathId: 'ap-01' },
      riskValues: [riskValue('ir-1', 4), riskValue('ir-2', 2)],
    })

    expect(result.groups[0].rows.map((row) => [row.category, row.state, row.risk])).toEqual([
      ['SAFETY', 'RATED', 4],
      ['FINANCIAL', 'NOT_RATED', null],
      ['OPERATIONAL', 'RATED', 2],
      ['PRIVACY', 'OMITTED', null],
    ])
    expect(result).toMatchObject({ max: 4, missing: null, groups: [{ max: 4, targetedCauses: [cause] }] })
  })

  it('takes the decisive attack path from the feasibility and lists the unrated ones', () => {
    const result = riskView({
      damageScenarios: [ds('ds-01', [])],
      attackPaths: [ap('ap-01', 'LOW'), ap('ap-02', 'HIGH', true), ap('ap-03', null)],
      feasibility: { rating: 'HIGH', attackPathId: 'ap-02' },
      riskValues: [],
    })

    expect(result.feasibility).toMatchObject({ feasibility: 'HIGH', decisive: { id: 'ap-02', isPartial: true } })
    expect(result.feasibility.unrated.map((path) => path.id)).toEqual(['ap-03'])
  })

  it('leaves damage scenarios without a target out of the highest risk', () => {
    const result = riskView({
      damageScenarios: [ds('ds-01', [rating('ir-1', 'SAFETY', 'MODERATE')]), ds('ds-02', [rating('ir-2', 'SAFETY', 'SEVERE')], false)],
      attackPaths: [ap('ap-01', 'HIGH')],
      feasibility: { rating: 'HIGH', attackPathId: 'ap-01' },
      riskValues: [riskValue('ir-1', 3), riskValue('ir-2', 5)],
    })

    expect(result.groups.map((group) => [group.damageScenario.code, group.counts, group.max])).toEqual([
      ['DS-1', true, 3],
      ['DS-2', false, 5],
    ])
    expect(result.max).toBe(3)
  })

  it('has no highest risk while no category is rated', () => {
    expect(
      riskView({ damageScenarios: [ds('ds-01', [], false)], attackPaths: [ap('ap-01', 'HIGH')], feasibility: { rating: 'HIGH', attackPathId: 'ap-01' }, riskValues: [] }),
    ).toMatchObject({ max: null, missing: null, groups: [{ max: null, targetedCauses: [] }] })
  })

  const rated = { feasibility: { rating: 'HIGH' as const, attackPathId: 'ap-01' }, riskValues: [] }
  const unrated = { feasibility: null, riskValues: [] }
  it.each([
    [{ damageScenarios: [], attackPaths: [ap('ap-01', 'HIGH')], ...rated }, ['NO_DAMAGE_SCENARIO']],
    [{ damageScenarios: [ds('ds-01', [rating('ir-1', 'SAFETY', 'SEVERE')])], attackPaths: [], ...unrated }, ['NO_ATTACK_PATH']],
    [{ damageScenarios: [ds('ds-01', [rating('ir-1', 'SAFETY', 'SEVERE')])], attackPaths: [ap('ap-01', null)], ...unrated }, ['NO_RATED_ATTACK_PATH']],
    [{ damageScenarios: [], attackPaths: [], ...unrated }, ['NO_DAMAGE_SCENARIO', 'NO_ATTACK_PATH']],
    [{ damageScenarios: [], attackPaths: [ap('ap-01', null)], ...unrated }, ['NO_DAMAGE_SCENARIO', 'NO_RATED_ATTACK_PATH']],
  ] as [ThreatScenarioRisks, string[]][])('names everything that is missing for any risk value (%#)', (risks, missing) => {
    expect(riskView(risks)).toMatchObject({ max: null, missing })
  })
})
