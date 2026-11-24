import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, defaultAuthContext, type AuthContextValue } from '@/auth/useAuth'
import { ApiProvider } from '../ApiProvider'
import { createMockItemApi } from '../mocks/mockItemApi'
import { createMockProjectApi } from '../mocks/mockProjectApi'
import type { ProjectRole } from '../models/project'
import { useProjectAccess } from './projects'
import { useDamageScenario, useImpactRatings, useUpdateDamageScenario, useUpdateImpactRatings } from './items'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const api = createMockItemApi()
  const projects = createMockProjectApi()
  let auth: AuthContextValue = {
    ...defaultAuthContext, status: 'authenticated', accessToken: 'token',
    user: { sub: 'first-user', name: 'First user', email: 'first@example.test' },
  }
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <ApiProvider api={{ ...api, projects }}>{children}</ApiProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  }
  return { client, api, wrapper, setAuth: (value: Partial<AuthContextValue>) => { auth = { ...auth, ...value } } }
}

describe('CRUD consistency', () => {
  it.each<[ProjectRole, boolean]>([['OWNER', true], ['EDITOR', true], ['VIEWER', false], ['REVIEWER', false]])(
    '%s has the expected analysis-content permissions', async (role, allowed) => {
      const { client, wrapper } = setup()
      client.setQueryData(['projects', 'headlamp', 'details'], { role, archived: false })
      const { result } = renderHook(() => useProjectAccess('headlamp'), { wrapper })
      expect(result.current.canEdit).toBe(allowed)
    },
  )

  it('keeps archived content read-only even for an owner', () => {
    const { client, wrapper } = setup()
    client.setQueryData(['projects', 'headlamp', 'details'], { role: 'OWNER', archived: true })
    const { result } = renderHook(() => useProjectAccess('headlamp'), { wrapper })
    expect(result.current.canEdit).toBe(false)
  })

  it('keeps the saved scenario available when the background reload fails', async () => {
    const { api, wrapper } = setup()
    const get = api.damageScenarios.get
    api.damageScenarios.get = vi.fn<typeof get>().mockImplementationOnce(get).mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => ({
      query: useDamageScenario('headlamp', 'ds-01'), update: useUpdateDamageScenario('headlamp', 'ds-01'),
    }), { wrapper })
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true))
    await act(() => result.current.update.mutateAsync({ title: 'Saved title' }))
    await waitFor(() => expect(result.current.query.isError).toBe(true))
    expect(result.current.query.data?.title).toBe('Saved title')
    expect(result.current.update.isSuccess).toBe(true)
  })

  it('keeps saved impact ratings when the background reload fails', async () => {
    const { api, wrapper } = setup()
    const load = api.damageScenarios.impactRatings
    api.damageScenarios.impactRatings = vi.fn<typeof load>().mockImplementationOnce(load).mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => ({
      query: useImpactRatings('headlamp', 'ds-01'), update: useUpdateImpactRatings('headlamp', 'ds-01'),
    }), { wrapper })
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true))
    await act(() => result.current.update.mutateAsync([{
      impact_category: 'SAFETY', rating_value: 'SEVERE', is_omitted_by_pm_15_07: false,
      omission_or_rating_rationale: 'Burn injuries', reused_from_functional_safety: false,
    }]))
    await waitFor(() => expect(result.current.query.isError).toBe(true))
    expect(result.current.query.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ impact_category: 'SAFETY', rating_value: 'SEVERE' }),
    ]))
    expect(result.current.update.isSuccess).toBe(true)
  })

  it.each(['logout', 'account switch'])('clears mounted private data and cancels pending loads on %s', async (change) => {
    const { client, wrapper, setAuth } = setup()
    client.setQueryData(['project-list'], ['private project'])
    client.setQueryData(['projects', 'private', 'damage-scenarios', 'ds-1', 'impact'], ['private rating'])
    client.setQueryData(['public-status'], 'healthy')
    let finish!: (value: string) => void
    const { result, rerender } = renderHook(() => useQuery({
      queryKey: ['projects', 'private', 'damage-scenarios', 'ds-1'],
      queryFn: () => new Promise<string>((resolve) => { finish = resolve }),
      enabled: false,
    }), { wrapper })
    client.setQueryData(['projects', 'private', 'damage-scenarios', 'ds-1'], 'private scenario')
    await waitFor(() => expect(result.current.data).toBe('private scenario'))
    let pending!: Promise<unknown>
    act(() => { pending = result.current.refetch() })
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    setAuth(change === 'logout'
      ? { status: 'unauthenticated', user: null, accessToken: null }
      : { user: { sub: 'second-user', name: 'Second', email: 'second@example.test' } })
    rerender()
    await waitFor(() => expect(result.current.data).toBeUndefined())
    await act(async () => { finish('late private response'); await pending })
    expect(client.getQueriesData({ queryKey: ['projects'] }).every(([, data]) => data === undefined)).toBe(true)
    expect(client.getQueryData(['project-list'])).toBeUndefined()
    expect(client.getQueryData(['public-status'])).toBe('healthy')
  })
})
