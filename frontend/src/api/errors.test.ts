import { describe, expect, it } from 'vitest'
import { ApiError, isUnauthorized, retryTransient } from './errors'

describe('retryTransient', () => {
  it('does not retry a missing session, missing rights or a missing resource', () => {
    expect(retryTransient(0, new ApiError(401, 'unauthorized'))).toBe(false)
    expect(retryTransient(0, new ApiError(403, 'forbidden'))).toBe(false)
    expect(retryTransient(0, new ApiError(404, 'gone'))).toBe(false)
  })

  it('retries other errors up to three times', () => {
    expect(retryTransient(0, new ApiError(500, 'oops'))).toBe(true)
    expect(retryTransient(2, new Error('network'))).toBe(true)
    expect(retryTransient(3, new Error('network'))).toBe(false)
  })
})

describe('isUnauthorized', () => {
  it('is true only for 401 API errors', () => {
    expect(isUnauthorized(new ApiError(401, 'unauthorized'))).toBe(true)
    expect(isUnauthorized(new ApiError(403, 'forbidden'))).toBe(false)
    expect(isUnauthorized(new Error('401'))).toBe(false)
  })
})
