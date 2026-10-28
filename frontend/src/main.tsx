import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { retryUnlessNotFound } from './features/items/itemApi'
import { ItemApiProvider } from './features/items/ItemApiProvider'
import { createMockItemApi } from './features/items/mockItemApi'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: retryUnlessNotFound } } })
// Mock until the item routes (#83) are wired to the generated API client (#118).
const itemApi = createMockItemApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ItemApiProvider api={itemApi}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ItemApiProvider>
    </QueryClientProvider>
  </StrictMode>,
)
