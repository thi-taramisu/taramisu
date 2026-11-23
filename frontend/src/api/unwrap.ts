import { ApiError } from './errors'

/** What openapi-fetch returns for every call: the data, or the problem details with the response. */
interface FetchResult<T> {
  data?: T
  error?: { detail?: string; title?: string }
  response: Response
}

/** Resolves with the data of a 2xx response, rejects with an `ApiError` with the status otherwise. */
export async function unwrap<T>(call: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await call
  if (!response.ok) {
    throw new ApiError(response.status, error?.detail ?? error?.title ?? (response.statusText || 'Request failed.'))
  }
  return data as T
}
