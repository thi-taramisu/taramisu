import { describe, expect, it } from 'vitest'
import { formatEntityId } from './entities'

describe('formatEntityId', () => {
  it.each([
    ['AS-001', 'AS-1'],
    ['DS-12', 'DS-12'],
    ['TS-03', 'TS-3'],
    ['AP-100', 'AP-100'],
    ['A-01', 'A-01'],
    ['IT-001', 'IT-1'],
    ['DS-12345678901234567890', 'DS-12345678901234567890'],
    ['uuid-value', 'uuid-value'],
  ])('formats %s as %s', (code, id) => {
    expect(formatEntityId(code)).toBe(id)
  })
})
