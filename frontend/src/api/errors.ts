/** Error of every failed service call; real adapters have to throw it with the HTTP status. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

/** True if the request had no valid session, i.e. the user has to sign in. */
export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401
}

// A retry cannot fix a missing session, missing rights or a missing resource.
const PERMANENT_STATUSES = new Set([401, 403, 404])

/** Retries failed queries like TanStack Query does by default, except for 401, 403 and 404. */
export function retryTransient(failureCount: number, error: unknown) {
  if (error instanceof ApiError && PERMANENT_STATUSES.has(error.status)) return false
  return failureCount < 3
}
