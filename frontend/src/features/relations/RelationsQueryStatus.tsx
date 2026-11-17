import type { UseQueryResult } from '@tanstack/react-query'

/** Loading and error states of the relations of an element; shows nothing while they are fine. */
export function RelationsQueryStatus({ query }: { query: Pick<UseQueryResult<unknown>, 'data' | 'isError'> }) {
  if (query.data) {
    return query.isError ? <p role="alert" className="text-sm text-destructive">The relations could not be refreshed.</p> : null
  }
  return query.isError ? (
    <p role="alert" className="text-sm text-destructive">The relations could not be loaded.</p>
  ) : (
    <output className="text-sm text-muted-foreground">Loading relations…</output>
  )
}
