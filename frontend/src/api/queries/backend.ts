import { useQuery } from '@tanstack/react-query'
import createQueryClient from 'openapi-react-query'
import { useMemo } from 'react'
import { useApi } from '../ApiProvider'

// REAL: hooks on the generated client, typed against `backend/openapi.json` via `../schema.d.ts`.

function useBackendQueries() {
  const { client } = useApi()
  return useMemo(() => createQueryClient(client), [client])
}

/** Liveness of the backend, `GET /health/live`. */
export function useHealth() {
  return useQuery(useBackendQueries().queryOptions('get', '/health/live'))
}

/** Signed-in user, `GET /api/v1/me`; fails with 401 without a session. */
export function useCurrentUser() {
  return useQuery(useBackendQueries().queryOptions('get', '/api/v1/me'))
}
