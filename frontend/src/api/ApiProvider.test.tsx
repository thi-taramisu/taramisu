import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AuthContext, type AuthContextValue } from '@/auth/useAuth'
import { ApiProvider, useApi } from './ApiProvider'

describe('ApiProvider', () => {
  it('preserves mock service instances and created data across access-token changes', async () => {
    let currentToken = 'initial-token'
    const queryClient = new QueryClient()

    function TestWrapper({ children }: { children: ReactNode }) {
      const authValue: AuthContextValue = {
        status: 'authenticated',
        user: { sub: 'user-1', name: 'User', email: 'user@test' },
        accessToken: currentToken,
        signIn: async () => {},
        signOut: async () => {},
        completeCallback: async () => '/',
      }
      return (
        <AuthContext.Provider value={authValue}>
          <QueryClientProvider client={queryClient}><ApiProvider>{children}</ApiProvider></QueryClientProvider>
        </AuthContext.Provider>
      )
    }

    const { result, rerender } = renderHook(() => useApi(), { wrapper: TestWrapper })

    // Items of the example project are served by the default mock item service
    const projectId = 'headlamp'
    const created = await result.current.items.create(projectId, {
      name: 'Battery Management System',
      scope_type: 'ITEM',
    })
    expect(created.id).toBeDefined()

    // Verify it is fetchable before token refresh
    const fetchedBefore = await result.current.items.get(projectId, created.id)
    expect(fetchedBefore.name).toBe('Battery Management System')

    queryClient.setQueryData(['projects', 'private', 'details'], { name: 'Private project' })

    // Simulate token refresh (accessToken change)
    currentToken = 'refreshed-token-123'
    rerender()

    expect(queryClient.getQueryData(['projects', 'private', 'details'])).toEqual({ name: 'Private project' })

    // Verify the created item still exists in the mock service after token change
    const fetchedAfter = await result.current.items.get(projectId, created.id)
    expect(fetchedAfter.name).toBe('Battery Management System')
  })
})
