import { describe, expect, it } from 'vitest'
import { feasibilityOf, summarize } from './attackFeasibility'

describe('feasibilityOf', () => {
  it.each([
    [0, 'HIGH'],
    [13, 'HIGH'],
    [14, 'MEDIUM'],
    [19, 'MEDIUM'],
    [20, 'LOW'],
    [24, 'LOW'],
    [25, 'VERY_LOW'],
  ])('rates %i points as %s', (total, feasibility) => {
    expect(feasibilityOf(total)).toBe(feasibility)
  })
})

describe('summarize', () => {
  const scores = { ap_elapsed_time: 4, ap_specialist_expertise: 3, ap_knowledge_of_item: 3, ap_window_of_opportunity: 1, ap_equipment: 0 }

  it('adds up the five factors', () => {
    expect(summarize(scores)).toEqual({ open: 0, total: 11, feasibility: 'HIGH' })
  })

  it('stays empty until all factors are rated', () => {
    expect(summarize({ ...scores, ap_equipment: null, ap_elapsed_time: null })).toEqual({ open: 2, total: null, feasibility: null })
  })
})
