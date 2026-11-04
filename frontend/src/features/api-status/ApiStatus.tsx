import { useHealth } from '../../api/queries/backend'

/** Example of a typed, cached call to the real backend: `GET /health/live` via openapi-react-query. */
export function ApiStatus() {
  const { data, error, isPending } = useHealth()

  if (isPending) return <p>Checking backend…</p>
  if (error) return <p>Backend error: {error.detail ?? error.title}</p>
  return <p>Backend: {data.status}</p>
}
