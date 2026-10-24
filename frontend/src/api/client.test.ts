import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApiClient } from './client'

const baseUrl = 'http://api.test/api/v1'
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('createApiClient', () => {
  it('returns typed data for a successful call', async () => {
    server.use(http.get(`${baseUrl}/health`, () => HttpResponse.json({ status: 'ok' })))

    const { data, error } = await createApiClient({ baseUrl }).GET('/health')

    expect(error).toBeUndefined()
    expect(data?.status).toBe('ok')
  })

  it('sends the bearer token from the token provider', async () => {
    let authorization: string | null = null
    server.use(
      http.get(`${baseUrl}/health`, ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json({ status: 'ok' })
      }),
    )

    await createApiClient({ baseUrl, getToken: () => 'abc' }).GET('/health')

    expect(authorization).toBe('Bearer abc')
  })

  it('omits the Authorization header without a token', async () => {
    let authorization: string | null = 'unset'
    server.use(
      http.get(`${baseUrl}/health`, ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json({ status: 'ok' })
      }),
    )

    await createApiClient({ baseUrl, getToken: () => null }).GET('/health')

    expect(authorization).toBeNull()
  })

  it('returns the error body and calls onUnauthorized on 401', async () => {
    server.use(
      http.get(`${baseUrl}/health`, () => HttpResponse.json({ message: 'nope' }, { status: 401 })),
    )
    const onUnauthorized = vi.fn<() => void>()

    const { data, error } = await createApiClient({ baseUrl, onUnauthorized }).GET('/health')

    expect(data).toBeUndefined()
    expect(error?.message).toBe('nope')
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
