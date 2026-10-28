import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { createMockItemApi } from '../../api/mocks/mockItemApi'

const project = '/projects/headlamp'

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const location = () => screen.getByTestId('location')

async function openNewItemDialog(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await within(tree()).findByRole('button', { name: 'New' }))
  await user.click(screen.getByRole('menuitem', { name: 'Item' }))
  return screen.getByRole('dialog', { name: 'New Item' })
}

describe('sidebar tree', () => {
  it('reads the items and the elements below them from the item API', async () => {
    const api = createMockItemApi()
    const extra = await api.items.create('headlamp', { name: 'Extra item', scope_type: 'ITEM' })
    renderApp(project, api)

    expect(await within(tree()).findByRole('link', { name: /Extra item/ })).toHaveAttribute('href', `${project}/items/${extra.id}`)
    expect(within(tree()).getByRole('link', { name: 'Headlamp system' })).toHaveAttribute('href', `${project}/items/i-01`)
    expect(within(tree()).getByRole('link', { name: /AP-02/ })).toBeInTheDocument()
  })
})

describe('create item', () => {
  it('offers only Item in the "+ New" menu for now', async () => {
    const { user } = renderApp(project)

    await user.click(await within(tree()).findByRole('button', { name: 'New' }))

    expect(screen.getByRole('menuitem', { name: 'Item' })).not.toHaveAttribute('aria-disabled')
    for (const name of ['Asset', 'Damage Scenario', 'Threat Scenario', 'Attack Path']) {
      expect(screen.getByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('requires a name', async () => {
    const { user, api } = renderApp(project)
    const dialog = await openNewItemDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), '   ')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(within(dialog).getByLabelText(/Name/)).toHaveAccessibleDescription('Name is required.')
    expect(await api.items.list('headlamp')).toHaveLength(1)
    expect(location()).toHaveTextContent(project)
  })

  it('creates the item, shows it in the tree and opens its page', async () => {
    const { user, api } = renderApp(project)
    const dialog = await openNewItemDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Charging Control Unit')
    await user.selectOptions(within(dialog).getByLabelText('Scope type'), 'COMPONENT')
    await user.selectOptions(within(dialog).getByLabelText('Lifecycle phase'), 'Product development')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'Charging Control Unit' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const created = (await api.items.list('headlamp')).find((item) => item.name === 'Charging Control Unit')!
    expect(created).toMatchObject({ scope_type: 'COMPONENT', lifecycle_phase: 'Product development' })
    expect(location()).toHaveTextContent(`${project}/items/${created.id}`)
    expect(within(tree()).getByRole('link', { name: /Charging Control Unit/ })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the dialog open with "Create & add another"', async () => {
    const { user } = renderApp(project)
    const dialog = await openNewItemDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Telematics unit')
    await user.click(within(dialog).getByRole('button', { name: 'Create & add another' }))

    // The modal hides the rest of the page from assistive technology, hence `hidden`.
    const hiddenTree = screen.getByRole('navigation', { name: 'Project elements', hidden: true })
    expect(await within(hiddenTree).findByRole('link', { name: /Telematics unit/, hidden: true })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('')
    expect(within(dialog).getByRole('status')).toHaveTextContent('Telematics unit created.')
    expect(location()).toHaveTextContent(new RegExp(`^${project}$`))
  })
})

describe('delete item', () => {
  it('names the item and what is deleted with it, and keeps it on cancel', async () => {
    const { user, api } = renderApp(`${project}/items/i-01`)

    await user.click(await screen.findByRole('button', { name: 'Delete item' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete "Headlamp system"?' })
    expect(dialog).toHaveTextContent('4 assets and 4 elements below them')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await api.items.list('headlamp')).toHaveLength(1)
  })

  it('deletes the item, removes it from the tree and returns to the project', async () => {
    const { user, api } = renderApp(`${project}/items/i-01/assets`)

    await user.click(await screen.findByRole('button', { name: 'Delete item' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete item' }))

    expect(await screen.findByText('No project elements yet.')).toBeInTheDocument()
    expect(location()).toHaveTextContent(new RegExp(`^${project}$`))
    expect(await api.items.list('headlamp')).toEqual([])
  })
})

describe('item page', () => {
  it('shows the type label and name in the header', async () => {
    renderApp(`${project}/items/i-01`)

    const header = (await screen.findByRole('heading', { name: 'Headlamp system' })).parentElement!
    expect(within(header).getByText('Item')).toBeInTheDocument()
  })

  it('shows a not-found state for unknown items', async () => {
    renderApp(`${project}/items/unknown`)

    expect(await screen.findByRole('heading', { name: 'Item not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to project' })).toHaveAttribute('href', project)
    expect(screen.queryByRole('navigation', { name: 'Item tabs' })).not.toBeInTheDocument()
  })

  it('edits and saves the definition', async () => {
    const { user, api } = renderApp(`${project}/items/i-01`)

    const boundary = await screen.findByLabelText(/Boundary/)
    expect(screen.getByLabelText(/Name/)).toHaveValue('Headlamp system')
    expect(screen.getByLabelText(/Functions/)).toHaveDisplayValue(/high beam/)
    expect(screen.getByLabelText(/Operational Environment/)).toHaveDisplayValue(/OBD-II/)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.clear(boundary)
    await user.type(boundary, 'Lamps only')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect((await api.items.get('headlamp', 'i-01')).boundary).toBe('Lamps only')
  })

  it('does not save a definition without a name', async () => {
    const { user, api } = renderApp(`${project}/items/i-01`)

    await user.clear(await screen.findByLabelText(/Name/))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText(/Name/)).toHaveAccessibleDescription('Name is required.')
    expect((await api.items.get('headlamp', 'i-01')).name).toBe('Headlamp system')
  })

  it('shows supporting files as a placeholder', async () => {
    renderApp(`${project}/items/i-01`)

    const files = await screen.findByRole('region', { name: /Supporting files/ })
    expect(within(files).getByText(/upload follows/i)).toBeInTheDocument()
  })

  it('shows the asset count in the tab label and the assets of the item', async () => {
    const { user } = renderApp(`${project}/items/i-01/assets`)

    const tabs = await screen.findByRole('navigation', { name: 'Item tabs' })
    expect(await within(tabs).findByRole('link', { name: 'Assets (4)' })).toHaveAttribute('aria-current', 'page')
    const row = (await screen.findByRole('link', { name: 'Headlamp on/off command' })).closest('tr')!
    expect(within(row).getByText('A-01')).toBeInTheDocument()
    expect(within(row).getByText('4')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Definition' }))
    expect(await screen.findByLabelText(/Boundary/)).toBeInTheDocument()
  })

  it('shows the risks grouped per asset', async () => {
    renderApp(`${project}/items/i-01/risks`)

    const table = await screen.findByRole('table')
    expect(within(table).getByRole('rowheader', { name: /A-01 Headlamp on\/off command/ })).toBeInTheDocument()
    expect(within(table).getAllByRole('link', { name: /TS-01 Spoofed headlamp command/ })[0]).toHaveAttribute(
      'href',
      `${project}/threat-scenarios/ts-01`,
    )
    expect(within(table).getAllByText('Risk 4').length).toBeGreaterThan(0)
  })

  it('shows an empty state for risks of a new item', async () => {
    const { user } = renderApp(project)
    const dialog = await openNewItemDialog(user)
    await user.type(within(dialog).getByLabelText(/Name/), 'Empty item')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    await user.click(await screen.findByRole('link', { name: 'Risks' }))

    expect(await screen.findByText(/No risks yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Assets (0)' })).toBeInTheDocument()
  })

  it('keeps the review tab as a placeholder', async () => {
    renderApp(`${project}/items/i-01/review`)

    expect(await screen.findByText('Review: not implemented yet')).toBeInTheDocument()
  })
})

describe('review findings', () => {
  it('creates and opens the item when Enter is pressed in the name field', async () => {
    const { user } = renderApp(project)
    const dialog = await openNewItemDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Gateway{Enter}')

    expect(await screen.findByRole('heading', { name: 'Gateway' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('announces a missing name', async () => {
    const { user } = renderApp(project)
    const dialog = await openNewItemDialog(user)

    expect(within(dialog).getByLabelText(/Name/)).toBeRequired()
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Name is required.')
  })

  it('cannot be closed while the item is being created', async () => {
    const api = createMockItemApi()
    api.items.create = () => new Promise(() => {})
    const { user } = renderApp(project, api)
    const dialog = await openNewItemDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Slow item')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog', { name: 'New Item' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('keeps the page usable after the dialog opened from the menu is closed', async () => {
    const { user } = renderApp(project)
    const dialog = await openNewItemDialog(user)

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await user.click(within(tree()).getByRole('link', { name: 'Headlamp system' }))

    expect(await screen.findByRole('heading', { name: 'Headlamp system' })).toBeInTheDocument()
  })

  it('shows "Saved." after saving a name with surrounding spaces', async () => {
    const { user, api } = renderApp(`${project}/items/i-01`)

    const name = await screen.findByLabelText(/Name/)
    await user.clear(name)
    await user.type(name, '  Front lighting  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect((await api.items.get('headlamp', 'i-01')).name).toBe('Front lighting')
  })

  it('keeps the item page when a refetch of the loaded item fails', async () => {
    const api = createMockItemApi()
    const { user } = renderApp(`${project}/items/i-01`, api)

    const boundary = await screen.findByLabelText(/Boundary/)
    await user.type(boundary, ' saved')
    // The save invalidates the item; its refetch fails, but the loaded data is still valid.
    api.items.get = () => Promise.reject(new Error('network'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be refreshed')
    expect(screen.getByLabelText(/Boundary/)).toHaveDisplayValue(/ saved$/)
  })

  it('keeps the add asset dialog open and shows an error when adding fails', async () => {
    const api = createMockItemApi()
    api.content.addAsset = () => Promise.reject(new Error('network'))
    const { user } = renderApp(`${project}/items/i-01/assets`, api)

    await user.click(await screen.findByRole('button', { name: 'Add Asset' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'LED driver')
    await user.type(within(dialog).getByLabelText('Component'), 'Lamp ECU')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('could not be added')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows an error instead of an empty table when the risks cannot be loaded', async () => {
    const api = createMockItemApi()
    api.content.risks = () => Promise.reject(new Error('network'))
    renderApp(`${project}/items/i-01/risks`, api)

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
  })

  it('still shows the tree when the elements below one item cannot be loaded', async () => {
    const api = createMockItemApi()
    const extra = await api.items.create('headlamp', { name: 'Extra item', scope_type: 'ITEM' })
    const children = api.content.children
    api.content.children = (projectId, itemId) =>
      itemId === extra.id ? Promise.reject(new Error('gone')) : children(projectId, itemId)
    renderApp(project, api)

    expect(await within(tree()).findByRole('link', { name: 'Extra item' })).toBeInTheDocument()
    expect(within(tree()).getByRole('link', { name: 'Headlamp system' })).toBeInTheDocument()
  })
})
