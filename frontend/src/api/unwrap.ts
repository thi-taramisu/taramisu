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

/** Backend collections use offset pagination; callers must not silently truncate at the default page size. */
export async function allPages<T>(load: (offset: number) => Promise<T[] | null>): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await load(offset) ?? []
    rows.push(...page)
    if (page.length < 100) return rows
  }
}
