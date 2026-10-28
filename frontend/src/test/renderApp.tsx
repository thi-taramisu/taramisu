import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from '../App'
import { ApiProvider } from '../api/ApiProvider'
import { createApiClient } from '../api/client'
import { createMockItemApi } from '../api/mocks/mockItemApi'

// eslint-disable-next-line react/only-export-components
function LocationDisplay() {
  const { pathname } = useLocation()
  return <output data-testid="location">{pathname}</output>
}

/** Renders the whole app at `path` with a fresh mock item API and query cache. */
export function renderApp(path: string, api = createMockItemApi()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={{ client: createApiClient({ baseUrl: 'http://api.test' }), ...api }}>
        <MemoryRouter initialEntries={[path]}>
          <App />
          <LocationDisplay />
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  )
  return { api, user }
}
