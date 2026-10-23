import createQueryClient from 'openapi-react-query'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ApiClient } from '../../api/client'

/** Example of a typed, cached API call: `GET /health` via openapi-react-query. */
export function ApiStatus({ client }: { client: ApiClient }) {
  const $api = useMemo(() => createQueryClient(client), [client])
  const { data, error, isPending } = useQuery($api.queryOptions('get', '/health'))

  if (isPending) return <p>Checking backend…</p>
  if (error) return <p>Backend error: {error.message}</p>
  return <p>Backend: {data.status}</p>
}
