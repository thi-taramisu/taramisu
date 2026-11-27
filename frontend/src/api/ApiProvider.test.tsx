import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AuthContext, type AuthContextValue } from '@/auth/useAuth'
import { ApiProvider, useApi } from './ApiProvider'
import { createMockProjectApi } from './mocks/mockProjectApi'
import { mockProjects } from './mocks/data/projects'

describe('ApiProvider', () => {
  it('scopes the default search to an injected project directory', async () => {
    const projects = createMockProjectApi(mockProjects.filter((project) => project.id === 'battery-security'))
    const { result } = renderHook(() => useApi(), {
      wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={{ projects }}>{children}</ApiProvider>,
    })
    const page = await result.current.search.search(
      { query: '', projectIds: [], types: [], offset: 0 },
      { signal: new AbortController().signal },
    )
    expect(page.results.map((match) => match.project.id)).toEqual(['battery-security'])
  })

  it('preserves mock service instances and created data across access-token changes', async () => {
    let currentToken = 'initial-token'

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
          <ApiProvider>{children}</ApiProvider>
        </AuthContext.Provider>
      )
    }

    const { result, rerender } = renderHook(() => useApi(), { wrapper: TestWrapper })

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
    currentToken = 'refreshed-token-123'
    rerender()

    // Verify the created item still exists in the mock service after token change
    const fetchedAfter = await result.current.items.get(projectId, created.id)
    expect(fetchedAfter.name).toBe('Battery Management System')
  })
})
