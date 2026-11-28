import { ApiError } from './errors'

/** Optional during rollout and for the example project. The API uses strong, quoted ETags. */
export interface Versioned {
  version?: number
}

export function ifMatch(version: number | undefined): Record<string, string> {
  return version === undefined ? {} : { 'If-Match': `"${version}"` }
}

export function isVersionConflict(error: unknown) {
  return error instanceof ApiError && (error.status === 412 || error.status === 428)
}
