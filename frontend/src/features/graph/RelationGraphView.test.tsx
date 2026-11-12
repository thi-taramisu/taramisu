import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { createMockItemApi } from '../../api/mocks/mockItemApi'

const route = '/projects/headlamp/threat-scenarios/ts-01?view=graph'
describe('graph view', () => {
  it('switches between full and minimal views and retains graph navigation in tree links', async () => {
    const { user } = renderApp(route)
    const toggle = await screen.findByRole('switch', { name: 'Minimal view' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('link', { name: /AP-02 Malicious/ })).toHaveAttribute('href', expect.stringContaining('graphMode=minimal'))
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })
  it('shows loading errors rather than presenting incomplete relations as an empty graph and allows retry', async () => {
    const api = createMockItemApi()
    const risks = api.content.risks
    api.content.risks = () => Promise.reject(new Error('offline'))
    const { user } = renderApp(route, api)
    expect(await screen.findByRole('alert')).toHaveTextContent('graph could not be loaded')
    api.content.risks = risks
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('region', { name: 'Relation graph' })).toBeInTheDocument()
  })
  it('does not invent nodes for an unknown entity', async () => {
    renderApp('/projects/headlamp/attack-paths/unknown?view=graph')
    expect(await screen.findByText('No graph data for this element.')).toBeInTheDocument()
  })
})
