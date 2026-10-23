import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { render } from './entry-server'

describe('SSR hydration', () => {
  it('preserves the rendered filetree and supports keyboard interaction and navigation', async () => {
    const url = '/projects/headlamp/assets/a-01/risks?view=graph'
    const previousUrl = window.location.href
    const container = document.createElement('div')
    container.innerHTML = render(url).html
    document.body.append(container)
    window.history.replaceState(null, '', url)
    const originalTree = within(container).getByRole('navigation', { name: 'Project elements' })
    const recovered = vi.fn<(error: unknown) => void>()
    const queryClient = new QueryClient()
    let root: Root | undefined

    try {
      await act(async () => {
        root = hydrateRoot(container,
          <StrictMode>
            <QueryClientProvider client={queryClient}>
              <BrowserRouter><App /></BrowserRouter>
            </QueryClientProvider>
          </StrictMode>,
          { onRecoverableError: recovered },
        )
      })

      expect(recovered).not.toHaveBeenCalled()
      expect(within(container).getByRole('navigation', { name: 'Project elements' })).toBe(originalTree)
      const user = userEvent.setup()
      const collapse = screen.getByRole('button', { name: 'Collapse A-01 Headlamp on/off command' })
      collapse.focus()
      await user.keyboard(' ')
      expect(screen.queryByRole('link', { name: /AP-02/ })).not.toBeInTheDocument()
      await user.keyboard('{Enter}')
      await user.click(screen.getByRole('link', { name: /AP-02/ }))
      expect(window.location.pathname).toBe('/projects/headlamp/attack-paths/ap-02')
      expect(window.location.search).toBe('?view=graph')
    } finally {
      await act(async () => root?.unmount())
      queryClient.clear()
      container.remove()
      window.history.replaceState(null, '', previousUrl)
    }
  })
})
