import { act, renderHook } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AuthContext, type AuthContextValue } from '@/auth/useAuth'
import { ApiProvider, useApi } from './ApiProvider'

describe('ApiProvider', () => {
  it('preserves mock service instances and created data across access-token changes', async () => {
    let changeToken: (newToken: string) => void = () => {}

    function TestWrapper({ children }: { children: ReactNode }) {
      const [token, setToken] = useState('initial-token')
      changeToken = setToken
      const authValue: AuthContextValue = {
        status: 'authenticated',
        user: { sub: 'user-1', name: 'User', email: 'user@test' },
        accessToken: token,
        signIn: async () => {},
        signOut: async () => {},
        completeCallback: async () => '/',
      }
      return (
        <AuthContext.Provider value={authValue}>
          <ApiProvider>{children}</ApiProvider>
        </AuthContext.Provider>
      )
    }

    const { result } = renderHook(() => useApi(), { wrapper: TestWrapper })

    // Create an item using the default mock item service
    const projectId = 'project-1'
    const created = await result.current.items.create(projectId, {
      name: 'Battery Management System',
      scope_type: 'ITEM',
    })
    expect(created.id).toBeDefined()

    // Verify it is fetchable before token refresh
    const fetchedBefore = await result.current.items.get(projectId, created.id)
    expect(fetchedBefore.name).toBe('Battery Management System')

    // Simulate token refresh (accessToken change)
    act(() => {
      changeToken('refreshed-token-123')
    })

    // Verify the created item still exists in the mock service after token change
    const fetchedAfter = await result.current.items.get(projectId, created.id)
    expect(fetchedAfter.name).toBe('Battery Management System')
  })
})
