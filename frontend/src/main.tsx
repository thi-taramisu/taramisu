import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { sentryEnabled } from './sentry.ts'
import { ApiProvider } from './api/ApiProvider'
import { retryUnlessNotFound } from './api/errors'
import { AuthProvider } from './auth/AuthContext'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: retryUnlessNotFound } } })

createRoot(document.getElementById('root')!, sentryEnabled ? {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
} : undefined).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ApiProvider>
            <App />
          </ApiProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
