import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApiClient } from './client'

const baseUrl = 'http://api.test'
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('createApiClient', () => {
  it('returns typed data for a successful call', async () => {
    server.use(http.get(`${baseUrl}/health/live`, () => HttpResponse.json({ status: 'ok' })))

    const { data, error } = await createApiClient({ baseUrl }).GET('/health/live')

    expect(error).toBeUndefined()
    expect(data?.status).toBe('ok')
  })

  it('calls the /api/v1 paths of the spec without adding a prefix', async () => {
    const user = { id: '0b7a9f9e-7d2c-4c55-8a4e-2f1c3d4e5f60', issuer: 'https://iam.test', subject: 'alex' }
    server.use(http.get(`${baseUrl}/api/v1/me`, () => HttpResponse.json(user)))

    const { data } = await createApiClient({ baseUrl }).GET('/api/v1/me')

    expect(data).toEqual(user)
  })

  it('sends the bearer token from the token provider', async () => {
    let authorization: string | null = null
    server.use(
      http.get(`${baseUrl}/health/live`, ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json({ status: 'ok' })
      }),
    )

    await createApiClient({ baseUrl, getToken: () => 'abc' }).GET('/health/live')

    expect(authorization).toBe('Bearer abc')
  })

  it('omits the Authorization header without a token', async () => {
    let authorization: string | null = 'unset'
    server.use(
      http.get(`${baseUrl}/health/live`, ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json({ status: 'ok' })
      }),
    )

    await createApiClient({ baseUrl, getToken: () => null }).GET('/health/live')

    expect(authorization).toBeNull()
  })

  it('returns the error body and calls onUnauthorized on 401', async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () =>
        HttpResponse.json({ type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'no session' }, { status: 401 }),
      ),
    )
    const onUnauthorized = vi.fn<() => void>()

    const { data, error } = await createApiClient({ baseUrl, onUnauthorized }).GET('/api/v1/me')

    expect(data).toBeUndefined()
    expect(error?.detail).toBe('no session')
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
