import { describe, expect, it } from 'vitest'
import { FEASIBILITY_ORDER, RISK_MATRIX, type RatedImpact } from './riskMatrix'

const ascending = (values: number[]) => values.toSorted((a, b) => a - b)

describe('RISK_MATRIX', () => {
  // The matrix need not be symmetric, but a higher impact or a more feasible attack must never lower the risk.
  it('never lowers the risk for a higher impact or a more feasible attack', () => {
    const impacts: RatedImpact[] = ['NEGLIGIBLE', 'MODERATE', 'MAJOR', 'SEVERE']
    const rows = impacts.map((impact) => FEASIBILITY_ORDER.map((feasibility) => RISK_MATRIX[impact][feasibility]))
    const columns = FEASIBILITY_ORDER.map((feasibility) => impacts.map((impact) => RISK_MATRIX[impact][feasibility]))

    for (const values of [...rows, ...columns]) expect(values).toEqual(ascending(values))
    expect(Math.min(...rows.flat())).toBe(1)
    expect(Math.max(...rows.flat())).toBe(5)
  })
})
