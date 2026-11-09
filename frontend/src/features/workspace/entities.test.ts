import { describe, expect, it } from 'vitest'
import { formatEntityId } from './entities'

describe('formatEntityId', () => {
  it.each([
    ['A-01', '#01'],
    ['DS-12', '#12'],
    ['TS-03', '#03'],
    ['AP-100', '#100'],
  ])('formats %s as %s', (code, id) => {
    expect(formatEntityId(code)).toBe(id)
  })
})
