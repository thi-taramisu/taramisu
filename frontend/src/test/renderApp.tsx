import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from '../App'
import { ApiProvider } from '../api/ApiProvider'
import { createApiClient } from '../api/client'
import { createMockItemApi } from '../api/mocks/mockItemApi'
import type { ProjectService } from '../api/services/projects'
import { AuthProvider } from '../auth/AuthContext'

// eslint-disable-next-line react/only-export-components
function LocationDisplay() {
  const { pathname } = useLocation()
  return <output data-testid="location">{pathname}</output>
}

/** Renders the whole app at `path` with fresh mock item and project APIs and a fresh query cache. */
export function renderApp(path: string, api = createMockItemApi(), projects: ProjectService = api.projects) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider api={{ client: createApiClient({ baseUrl: 'http://api.test' }), ...api, projects }}>
          <MemoryRouter initialEntries={[path]}>
            <App />
            <LocationDisplay />
          </MemoryRouter>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { api, projects, user }
}
