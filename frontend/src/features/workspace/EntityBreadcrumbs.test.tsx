import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ApiProvider } from '../../api/ApiProvider'
import { createApiClient } from '../../api/client'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import type { EntityType, TreeNode } from '../../api/models/tree'
import { EntityPage } from './EntityPage'
import { formatEntityId, hierarchySearch } from './entities'
import { Filetree } from './Filetree'
import { useProjectTree } from '../../api/queries/items'

function TestTree() {
  const { data = [] } = useProjectTree('headlamp')
  return <nav aria-label="Test hierarchy"><Filetree projectId="headlamp" nodes={data} /></nav>
}

function renderPage(path: string, api = createMockItemApi(), showTree = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={{ client: createApiClient(), ...api }}>
        <MemoryRouter initialEntries={[`/projects/headlamp/${path}`]}>
          {showTree && <TestTree />}
          <Routes>
            {(['items', 'assets', 'damage-scenarios', 'threat-scenarios', 'attack-paths'] as EntityType[]).map((type) => (
              <Route key={type} path={`/projects/:projectId/${type}/:entityId/*`} element={<EntityPage type={type} />} />
            ))}
          </Routes>
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  )
  return queryClient
}

const breadcrumbs = () => within(screen.getByRole('navigation', { name: 'Breadcrumbs' }))

describe('Entity breadcrumbs', () => {
  it('shows a newly created item by name while keeping its UUID in parent navigation', async () => {
    const api = createMockItemApi()
    const item = await api.items.create('headlamp', { name: 'New headlamp', scope_type: 'ITEM' })
    const asset = await api.content.addAsset('headlamp', item.id, { name: 'Firmware', component: 'ECU', properties: ['I'] })
    const user = userEvent.setup()
    renderPage(`assets/${asset.id}`, api)
    await breadcrumbs().findByText(`${formatEntityId(asset.code)} Firmware`)
    const parent = breadcrumbs().getByRole('link', { name: 'New headlamp' })
    expect(parent).toHaveAttribute('href', `/projects/headlamp/items/${item.id}`)
    expect(screen.getByRole('navigation', { name: 'Breadcrumbs' })).not.toHaveTextContent(item.id)
    await user.click(parent)
    expect(breadcrumbs().getByText('New headlamp')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('navigation', { name: 'Breadcrumbs' })).not.toHaveTextContent(item.id)
  })

  it('shows the full path on tabs, with IDs, and follows parent links while preserving view parameters', async () => {
    const user = userEvent.setup()
    renderPage('attack-paths/ap-01/rating?view=graph&filter=open')
    const current = await breadcrumbs().findByText('AP-1 Compromised navigation ECU via cellular')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(breadcrumbs().queryByRole('link', { name: /AP-1/ })).not.toBeInTheDocument()
    expect(breadcrumbs().getAllByRole('listitem')).toHaveLength(5)
    expect(breadcrumbs().getByRole('link', { name: 'Headlamp system' })).toHaveAttribute('href', '/projects/headlamp/items/i-01?view=graph&filter=open')
    const parent = breadcrumbs().getByRole('link', { name: /TS-1/ })
    await user.click(parent)
    expect(breadcrumbs().getByText('TS-1 Spoofed headlamp command on the CAN bus')).toHaveAttribute('aria-current', 'page')
    expect(breadcrumbs().queryByText(/AP-1/)).not.toBeInTheDocument()
    await user.click(breadcrumbs().getByRole('link', { name: 'Headlamp system' }))
    expect(breadcrumbs().getByText('Headlamp system')).toHaveAttribute('aria-current', 'page')
    expect(breadcrumbs().queryByRole('link')).not.toBeInTheDocument()
  })

  it('updates names and relation paths when the shared tree refreshes, choosing the first shared occurrence', async () => {
    const api = createMockItemApi()
    const queryClient = renderPage('assets/a-01', api)
    await breadcrumbs().findByText('AS-1 Headlamp on/off command')
    const longName = 'Renamed asset '.repeat(40)
    const shared: TreeNode = { type: 'assets', id: 'a-01', code: 'AS-1', name: longName }
    vi.spyOn(api.content, 'children').mockResolvedValue([
      { type: 'assets', id: 'a-02', code: 'AS-2', name: 'New parent', children: [shared] },
      shared,
    ])
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['projects', 'headlamp'] }) })
    expect(await breadcrumbs().findByText(`AS-1 ${longName.trim()}`)).toHaveAttribute('aria-current', 'page')
    expect(breadcrumbs().getByRole('link', { name: 'AS-2 New parent' })).toBeInTheDocument()
    expect(breadcrumbs().getAllByRole('listitem')).toHaveLength(3)
  })

  it('supports native Tab/Enter navigation and hides separators from assistive technology', async () => {
    const user = userEvent.setup()
    renderPage('damage-scenarios/ds-01')
    await breadcrumbs().findByText('DS-1 Headlamp turns off while driving at night')
    const parents = breadcrumbs().getAllByRole('link')
    await user.tab()
    expect(parents[0]).toHaveFocus()
    await user.tab()
    expect(parents[1]).toHaveFocus()
    for (const separator of breadcrumbs().getAllByText('/')) {
      expect(separator).toHaveAttribute('aria-hidden', 'true')
    }
    await user.keyboard('{Enter}')
    expect(breadcrumbs().getByText('AS-1 Headlamp on/off command')).toHaveAttribute('aria-current', 'page')
    expect(breadcrumbs().queryByText(/DS-1/)).not.toBeInTheDocument()
  })

  it('keeps a loaded trail on a failed refresh and recovers after the element disappears and returns', async () => {
    const api = createMockItemApi()
    const queryClient = renderPage('assets/a-01', api)
    await breadcrumbs().findByText('AS-1 Headlamp on/off command')
    const list = vi.spyOn(api.items, 'list').mockRejectedValue(new Error('Offline'))
    const refresh = () => act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects', 'headlamp'] })
    })
    await refresh()
    expect(breadcrumbs().getByText('AS-1 Headlamp on/off command')).toHaveAttribute('aria-current', 'page')
    list.mockRestore()
    const children = vi.spyOn(api.content, 'children').mockResolvedValue([])
    await refresh()
    expect(await breadcrumbs().findByText('Path unavailable')).toHaveAttribute('aria-current', 'page')
    children.mockRestore()
    await refresh()
    expect(await breadcrumbs().findByText('AS-1 Headlamp on/off command')).toHaveAttribute('aria-current', 'page')
    expect(breadcrumbs().getByRole('link', { name: 'Headlamp system' })).toBeInTheDocument()
  })

  it.each(['missing', 'error', 'missing parent', 'empty'] as const)('keeps the page usable with a clear fallback (%s)', async (failure) => {
    const api = createMockItemApi()
    if (failure === 'empty') vi.spyOn(api.items, 'list').mockResolvedValue([])
    if (failure === 'error') vi.spyOn(api.items, 'list').mockRejectedValue(new Error('Offline'))
    if (failure === 'missing parent') vi.spyOn(api.content, 'children').mockRejectedValue(new Error('Deleted'))
    renderPage(`assets/${failure === 'missing' ? 'unknown' : 'a-01'}`, api)
    const id = failure === 'missing' ? 'unknown' : 'a-01'
    expect(breadcrumbs().getByText('Loading…')).toHaveAttribute('aria-current', 'page')
    expect(await breadcrumbs().findByText('Path unavailable')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: id })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Asset tabs' })).toBeInTheDocument()
  })
})


async function sharedScenario() {
  const api = createMockItemApi()
  const children = await api.content.children('headlamp', 'i-01')
  const scenario = children[0].children![0]
  children[1].children = [scenario]
  const spy = vi.spyOn(api.content, 'children').mockResolvedValue(children)
  return { api, children, spy }
}

describe('shared hierarchy paths', () => {
  it('selects all available paths from the dropdown and keeps the choice on tabs and parent navigation', async () => {
    const { api } = await sharedScenario()
    const user = userEvent.setup()
    renderPage('damage-scenarios/ds-01?filter=open', api)
    await user.click(await breadcrumbs().findByRole('button', { name: 'Select hierarchy path' }))
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2)
    await user.click(screen.getByRole('menuitemradio', { name: /AS-2 Body control ECU firmware/ }))
    expect(breadcrumbs().getByRole('link', { name: /AS-2/ })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Impact' }))
    expect(breadcrumbs().getByRole('link', { name: /AS-2/ })).toBeInTheDocument()
    const parent = breadcrumbs().getByRole('link', { name: /AS-2/ })
    expect(parent.getAttribute('href')).toContain('filter=open')
    await user.click(parent)
    expect(breadcrumbs().getByText('AS-2 Body control ECU firmware')).toHaveAttribute('aria-current', 'page')
  })

  it('follows the exact occurrence clicked in the hierarchy and marks only that occurrence active', async () => {
    const { api } = await sharedScenario()
    const user = userEvent.setup()
    renderPage('damage-scenarios/ds-01', api, true)
    const tree = within(screen.getByRole('navigation', { name: 'Test hierarchy' }))
    const links = await tree.findAllByRole('link', { name: /^DS-1 / })
    await user.click(links[1])
    expect(breadcrumbs().getByRole('link', { name: /AS-2/ })).toBeInTheDocument()
    expect(links[1]).toHaveAttribute('aria-current', 'page')
    expect(links[0]).not.toHaveAttribute('aria-current', 'page')
    await user.click(links[0])
    expect(breadcrumbs().getByRole('link', { name: /AS-1/ })).toBeInTheDocument()
  })

  it('falls back to an existing path if the chosen relation is removed', async () => {
    const { api, children, spy } = await sharedScenario()
    const chosen = [{ type: 'items' as const, id: 'i-01', name: 'Headlamp' }, children[1], children[1].children![0]]
    const queryClient = renderPage(`damage-scenarios/ds-01${hierarchySearch('', chosen, true)}`, api)
    await breadcrumbs().findByRole('link', { name: /AS-2/ })
    spy.mockResolvedValue([children[0]])
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['projects', 'headlamp'] }) })
    expect(await breadcrumbs().findByRole('link', { name: /AS-1/ })).toBeInTheDocument()
    expect(breadcrumbs().queryByRole('button', { name: 'Select hierarchy path' })).not.toBeInTheDocument()
  })

  it('ignores an invalid path parameter', async () => {
    const { api } = await sharedScenario()
    renderPage('damage-scenarios/ds-01?hierarchy=invalid', api)
    expect(await breadcrumbs().findByRole('link', { name: /AS-1/ })).toBeInTheDocument()
  })
})
