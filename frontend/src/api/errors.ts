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

/** Retries failed queries like TanStack Query does by default, except for 404s. */
export function retryUnlessNotFound(failureCount: number, error: unknown) {
  return !isNotFound(error) && failureCount < 3
}
