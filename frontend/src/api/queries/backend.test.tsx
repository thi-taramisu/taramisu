import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiProvider } from '../ApiProvider'
import { createApiClient } from '../client'
import { createMockItemApi } from '../mocks/mockItemApi'
import { useCurrentUser } from './backend'

const baseUrl = 'http://api.test'
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={{ client: createApiClient({ baseUrl }), ...createMockItemApi() }}>{children}</ApiProvider>
    </QueryClientProvider>
  )
}

describe('useCurrentUser', () => {
  it('reads the signed-in user from GET /api/v1/me', async () => {
    const user = { id: '0b7a9f9e-7d2c-4c55-8a4e-2f1c3d4e5f60', issuer: 'https://iam.test', subject: 'alex' }
    server.use(http.get(`${baseUrl}/api/v1/me`, () => HttpResponse.json(user)))

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(user))
  })

  it('fails without a session', async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () =>
        HttpResponse.json({ type: 'about:blank', title: 'Unauthorized', status: 401 }, { status: 401 }),
      ),
    )

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    await waitFor(() => expect(result.current.error?.status).toBe(401))
  })
})
