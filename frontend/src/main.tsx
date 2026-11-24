import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import './index.css'
import { i18n } from './i18n'
import App from './App.tsx'
import { ApiProvider } from './api/ApiProvider'
import { retryUnlessNotFound } from './api/errors'
import { AuthProvider } from './auth/AuthContext'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: retryUnlessNotFound } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ApiProvider>
              <App />
            </ApiProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
)
