import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { type Api, ApiProvider } from './api/ApiProvider'
import { createApiClient } from './api/client'
import { retryUnlessNotFound } from './api/errors'
import { createMockItemApi } from './api/mocks/mockItemApi'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: retryUnlessNotFound } } })

const api: Api = {
  // Real: the generated client against the backend.
  client: createApiClient(),
  // Mocked until the item routes (#83) are in `backend/openapi.json`.
  ...createMockItemApi(),
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>,
)
