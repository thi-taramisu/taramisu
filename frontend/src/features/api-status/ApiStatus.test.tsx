import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiProvider } from '../../api/ApiProvider'
import { createApiClient } from '../../api/client'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { ApiStatus } from './ApiStatus'

const baseUrl = 'http://api.test'
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderStatus() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={{ client: createApiClient({ baseUrl }), ...createMockItemApi() }}>
        <ApiStatus />
      </ApiProvider>
    </QueryClientProvider>,
  )
}

describe('ApiStatus', () => {
  it('shows loading, then the backend status', async () => {
    server.use(http.get(`${baseUrl}/health/live`, () => HttpResponse.json({ status: 'ok' })))
    renderStatus()

    expect(screen.getByText('Checking backend…')).toBeInTheDocument()
    expect(await screen.findByText('Backend: ok')).toBeInTheDocument()
  })

  it('shows the error detail of the API', async () => {
    server.use(
      http.get(`${baseUrl}/health/live`, () =>
        HttpResponse.json({ type: 'about:blank', title: 'Service Unavailable', status: 503, detail: 'down' }, { status: 503 }),
      ),
    )
    renderStatus()

    expect(await screen.findByText('Backend error: down')).toBeInTheDocument()
  })
})
