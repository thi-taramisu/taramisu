import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { AuthContext, defaultAuthContext, type AuthContextValue } from '@/auth/useAuth'
import { deferred } from '@/test/deferred'
import { ApiProvider } from '../ApiProvider'
import { ApiError } from '../errors'
import { createMockProjectApi } from '../mocks/mockProjectApi'
import { useProjects } from './projects'
import { useResetQueriesOnSignOut } from './session'

const signedIn: AuthContextValue = {
  ...defaultAuthContext,
  status: 'authenticated',
  user: { sub: 'user-1', name: 'User', email: 'user@test' },
  accessToken: 'token',
}

function ProjectNames() {
  useResetQueriesOnSignOut()
  const { data } = useProjects()
  return <ul>{data?.map((project) => <li key={project.id}>{project.name}</li>)}</ul>
}

/** Renders the project list for a session that the test can end, like `signOut({ localOnly: true })` does. */
function renderSession(list: () => Promise<unknown>) {
  const projects = createMockProjectApi()
  const listForSession = projects.list
  let session = signedIn
  // Like the backend: without a session the list is refused.
  projects.list = async () => {
    if (session.status !== 'authenticated') throw new ApiError(401, 'Unauthorized.')
    await list()
    return listForSession()
  }
  function Session() {
    const [auth, setAuth] = useState(signedIn)
    function endSession() {
      session = defaultAuthContext
      setAuth(defaultAuthContext)
    }
    return (
      <AuthContext.Provider value={auth}>
        <button type="button" onClick={endSession}>
          End session
        </button>
        <ApiProvider api={{ projects }}>
          <ProjectNames />
        </ApiProvider>
      </AuthContext.Provider>
    )
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Session />
    </QueryClientProvider>,
  )
  return { endSession: () => fireEvent.click(screen.getByRole('button', { name: 'End session' })) }
}

describe('useResetQueriesOnSignOut', () => {
  it('drops the loaded projects when the session ends', async () => {
    const { endSession } = renderSession(async () => {})
    expect(await screen.findByText('Battery Security')).toBeInTheDocument()

    endSession()

    expect(screen.queryByText('Battery Security')).not.toBeInTheDocument()
  })

  it('does not show projects of a request that was still running when the session ended', async () => {
    const request = deferred()
    let started = false
    const { endSession } = renderSession(() => {
      started = true
      return request.promise
    })
    expect(started).toBe(true)

    endSession()
    request.release()
    // React Query reports results on a timer, so a late result of the old session would show by now.
    await act(() => new Promise((done) => setTimeout(done, 20)))

    expect(screen.queryByText('Battery Security')).not.toBeInTheDocument()
  })
})
