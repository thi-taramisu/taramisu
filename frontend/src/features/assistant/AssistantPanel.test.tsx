import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ApiProvider } from '../../api/ApiProvider'
import { createApiClient } from '../../api/client'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { AuthContext, defaultAuthContext, type AuthContextValue } from '../../auth/useAuth'
import { AssistantPanel } from './AssistantPanel'

const baseUrl = 'http://api.test'
const projectA = { id: '11111111-1111-4111-8111-111111111111', name: 'Demo ECU', role: 'OWNER', created_at: '2026-11-11T00:00:00Z' }
const projectB = { id: '22222222-2222-4222-8222-222222222222', name: 'Gateway', role: 'VIEWER', created_at: '2026-11-11T00:00:00Z' }
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  localStorage.clear()
  server.use(http.get(`${baseUrl}/api/v1/projects`, () => HttpResponse.json([projectA, projectB])))
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const signedIn: AuthContextValue = { ...defaultAuthContext, status: 'authenticated', accessToken: 'token' }

function renderPanel(onClose = () => {}, auth = signedIn) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <ApiProvider api={{ client: createApiClient({ baseUrl }), ...createMockItemApi() }}>
          <MemoryRouter initialEntries={['/projects/headlamp']}>
            <AssistantPanel open onClose={onClose} />
          </MemoryRouter>
        </ApiProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** The panel is ready once the projects are loaded and a project is active. */
async function waitUntilReady() {
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message to the assistant' })).toBeEnabled())
}

describe('AssistantPanel', () => {
  it('asks the assistant about the first project and shows the answer with the tools used', async () => {
    const requests: { projectId: string; body: unknown }[] = []
    server.use(
      http.post(`${baseUrl}/api/v1/projects/:projectId/assistant`, async ({ params, request }) => {
        requests.push({ projectId: String(params.projectId), body: await request.json() })
        return HttpResponse.json({ answer: 'Demo ECU has one item.', tools_used: ['list_item_definitions'] })
      }),
    )
    const user = renderPanel()

    await waitUntilReady()
    await user.type(screen.getByRole('textbox', { name: 'Message to the assistant' }), 'Which items?{Enter}')

    expect(await screen.findByText('Demo ECU has one item.')).toBeInTheDocument()
    expect(screen.getByText('Read: list_item_definitions')).toBeInTheDocument()
    expect(screen.getByText('Which items?')).toBeInTheDocument()
    expect(requests).toEqual([{ projectId: projectA.id, body: { messages: [{ role: 'user', content: 'Which items?' }] } }])
  })

  it('sends the conversation so far with a follow-up question', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(`${baseUrl}/api/v1/projects/:projectId/assistant`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ answer: `Answer ${bodies.length}`, tools_used: [] })
      }),
    )
    const user = renderPanel()
    const input = await screen.findByRole('textbox', { name: 'Message to the assistant' })
    await waitUntilReady()

    await user.type(input, 'First{Enter}')
    await screen.findByText('Answer 1')
    await user.type(input, 'Second{Enter}')
    await screen.findByText('Answer 2')

    expect(bodies[1]).toEqual({
      messages: [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Answer 1' },
        { role: 'user', content: 'Second' },
      ],
    })
  })

  it('asks about the remembered project without a project picker', async () => {
    localStorage.setItem('taramisu.assistant.project', projectB.id)
    const projectIds: string[] = []
    server.use(
      http.post(`${baseUrl}/api/v1/projects/:projectId/assistant`, ({ params }) => {
        projectIds.push(String(params.projectId))
        return HttpResponse.json({ answer: 'ok', tools_used: [] })
      }),
    )
    const user = renderPanel()
    await waitUntilReady()

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Message to the assistant' }), 'Hi{Enter}')
    await screen.findByText('ok')
    expect(projectIds).toEqual([projectB.id])
  })

  it.each([
    [503, 'The assistant is not available. Is LLM_API_KEY set for the LLM service?'],
    [429, 'The assistant is busy. Try again in a few seconds.'],
  ])('explains a %i response', async (status, text) => {
    server.use(
      http.post(`${baseUrl}/api/v1/projects/:projectId/assistant`, () =>
        HttpResponse.json({ title: 'Error', status, detail: 'from server' }, { status }),
      ),
    )
    const user = renderPanel()
    await waitUntilReady()

    await user.type(screen.getByRole('textbox', { name: 'Message to the assistant' }), 'Hi{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('cannot send without a project', async () => {
    server.use(http.get(`${baseUrl}/api/v1/projects`, () => HttpResponse.json([])))
    renderPanel()

    expect(await screen.findByText('You have no projects in the database yet.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message to the assistant' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('asks to sign in instead of loading projects when signed out', async () => {
    let projectRequests = 0
    server.use(http.get(`${baseUrl}/api/v1/projects`, () => { projectRequests++; return HttpResponse.json([]) }))
    const signIn = vi.fn<AuthContextValue['signIn']>(async () => {})
    const user = renderPanel(() => {}, { ...defaultAuthContext, signIn })

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(signIn).toHaveBeenCalledWith('/projects/headlamp')
    expect(screen.getByRole('textbox', { name: 'Message to the assistant' })).toBeDisabled()
    expect(projectRequests).toBe(0)
  })

  it('closes', async () => {
    const onClose = vi.fn<() => void>()
    const user = renderPanel(onClose)

    await user.click(screen.getByRole('button', { name: 'Close assistant' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
