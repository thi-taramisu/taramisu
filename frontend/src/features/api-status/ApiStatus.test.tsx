import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApiClient } from '../../api/client'
import { ApiStatus } from './ApiStatus'

const baseUrl = 'http://api.test/api/v1'
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderStatus() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ApiStatus client={createApiClient({ baseUrl })} />
    </QueryClientProvider>,
  )
}

describe('ApiStatus', () => {
  it('shows loading, then the backend status', async () => {
    server.use(http.get(`${baseUrl}/health`, () => HttpResponse.json({ status: 'ok' })))
    renderStatus()

    expect(screen.getByText('Checking backend…')).toBeInTheDocument()
    expect(await screen.findByText('Backend: ok')).toBeInTheDocument()
  })

  it('shows the API error message', async () => {
    server.use(
      http.get(`${baseUrl}/health`, () => HttpResponse.json({ message: 'nope' }, { status: 401 })),
    )
    renderStatus()

    expect(await screen.findByText('Backend error: nope')).toBeInTheDocument()
  })
})
