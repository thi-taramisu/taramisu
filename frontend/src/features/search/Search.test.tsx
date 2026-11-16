import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import type { SearchPage } from '../../api/models/search'
import { renderApp } from '../../test/renderApp'

const dialogName = 'Search projects and elements'
const inputName = 'Search by name or ID'
const resultList = (dialog: HTMLElement) => within(within(dialog).getByRole('listbox', { name: 'Search results' }))

async function openSearch(path = '/projects', api = createMockItemApi()) {
  const app = renderApp(path, api)
  await app.user.click(await screen.findByRole('button', { name: dialogName }))
  const dialog = screen.getByRole('dialog', { name: dialogName })
  const input = within(dialog).getByRole('combobox', { name: inputName })
  await resultList(dialog).findAllByRole('option')
  return { ...app, dialog, input }
}

describe('Spotlight search', () => {
  it('finds a newly created project and keeps it when returning from its workspace', async () => {
    const { user } = renderApp('/projects')
    await user.click(screen.getByRole('button', { name: 'Create Project' }))
    const create = screen.getByRole('dialog', { name: 'Create Project' })
    await user.type(within(create).getByRole('textbox', { name: 'Project name' }), 'Spotlight project')
    await user.click(within(create).getByRole('button', { name: 'Create' }))
    await user.click(screen.getByRole('button', { name: dialogName }))
    const dialog = screen.getByRole('dialog', { name: dialogName })
    await user.type(within(dialog).getByRole('combobox', { name: inputName }), 'Spotlight project')
    await user.click(await resultList(dialog).findByRole('option', { name: /Spotlight project/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Spotlight project')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Projects' }))
    expect(await screen.findByRole('button', { name: 'Actions for Spotlight project' })).toBeInTheDocument()
  })

  it('opens from the start page with focus, no default filter, and returns focus on Escape', async () => {
    const { user, dialog, input } = await openSearch()
    expect(input).toHaveFocus()
    expect(within(dialog).getByText('All accessible projects')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Active search filters')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: dialogName })).toHaveFocus()
  })

  it.each(['Control', 'Meta'])('opens globally with %s+K and toggles closed again', async (modifier) => {
    const { user } = renderApp('/design-system/colors')
    await user.keyboard(`{${modifier}>}k{/${modifier}}`)
    expect(screen.getByRole('combobox', { name: inputName })).toHaveFocus()
    await user.keyboard(`{${modifier}>}k{/${modifier}}`)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('searches by display ID and opens the selected element with Enter', async () => {
    const { user, input, dialog } = await openSearch()
    await user.type(input, 'ts-01')
    const option = await resultList(dialog).findByRole('option', { name: /Spoofed headlamp/ })
    expect(option).toHaveTextContent('TS-01')
    expect(option).toHaveTextContent('Threat scenario')
    expect(option).toHaveTextContent('Headlamp System')
    expect(input).toHaveAttribute('aria-activedescendant', option.id)
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/projects/headlamp/threat-scenarios/ts-01')
    expect(await screen.findByRole('heading', { name: /Spoofed headlamp/ })).toBeInTheDocument()
  })

  it('moves the active option with arrows while keeping focus in the input', async () => {
    const { user, input, dialog } = await openSearch()
    await user.click(within(dialog).getByRole('button', { name: 'Asset' }))
    const options = await resultList(dialog).findAllByRole('option')
    expect(options).toHaveLength(4)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    await user.click(input)
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveFocus()
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(options.at(-1)).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', options.at(-1)!.id)
  })

  it('starts scoped to the current project, combines/removes filters, and opens a different project', async () => {
    const { user, dialog, input } = await openSearch('/projects/headlamp/items/i-01')
    expect(within(dialog).getByRole('button', { name: 'Remove Headlamp System filter' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Project' }))
    expect(await resultList(dialog).findByRole('option', { name: /Headlamp System.*Project/ })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Asset' }))
    await waitFor(() => expect(resultList(dialog).getAllByRole('option')).toHaveLength(5))
    await user.click(within(dialog).getByRole('button', { name: 'Remove Asset filter' }))
    await user.click(within(dialog).getByRole('button', { name: 'Remove Headlamp System filter' }))
    await user.type(input, 'battery')
    await user.click(await resultList(dialog).findByRole('option', { name: /Battery Security/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/projects/battery-security')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Battery Security')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument()
  })

  it('combines multiple selected projects and clears all active filters', async () => {
    const { user, dialog } = await openSearch()
    const select = within(dialog).getByLabelText('Filter by project')
    await user.selectOptions(select, 'battery-security')
    await user.selectOptions(select, 'vehicle-gateway')
    await user.click(within(dialog).getByRole('button', { name: 'Project' }))
    await waitFor(() => expect(resultList(dialog).getAllByRole('option')).toHaveLength(2))
    await user.click(within(dialog).getByRole('button', { name: 'Clear filters' }))
    expect(within(dialog).queryByLabelText('Active search filters')).not.toBeInTheDocument()
    expect(await within(dialog).findByText('All accessible projects')).toBeInTheDocument()
  })

  it('shows no matches and starts a fresh search session on reopening', async () => {
    const { user, input, dialog } = await openSearch()
    await user.type(input, 'nonexistent-element')
    expect(await within(dialog).findByText(/No results\./)).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(dialog).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: dialogName }))
    expect(screen.getByRole('combobox', { name: inputName })).toHaveValue('')
  })

  it('shows loading and errors, and retries without losing the query', async () => {
    const api = createMockItemApi()
    const search = api.search.search
    let reject!: (reason: Error) => void
    api.search.search = () => new Promise((_resolve, fail) => { reject = fail })
    const { user } = renderApp('/projects', api)
    await user.click(screen.getByRole('button', { name: dialogName }))
    const dialog = screen.getByRole('dialog', { name: dialogName })
    expect(await within(dialog).findByText('Searching…')).toBeInTheDocument()
    await act(async () => reject(new Error('Unavailable')))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Search could not be loaded')
    api.search.search = search
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }))
    expect((await resultList(dialog).findAllByRole('option')).length).toBeGreaterThan(0)
  })

  it('does not show an old response after a newer query completes, even if the adapter ignores abort', async () => {
    const api = createMockItemApi()
    const search = api.search.search
    let resolveOld!: (page: SearchPage) => void
    let oldSignal!: AbortSignal
    api.search.search = (request, options) => {
      if (request.query === 'old') {
        oldSignal = options.signal
        return new Promise((resolve) => { resolveOld = resolve })
      }
      return search(request, options)
    }
    const { user, input, dialog } = await openSearch('/projects', api)
    await user.type(input, 'old')
    await waitFor(() => expect(resolveOld).toBeDefined())
    await user.clear(input)
    await user.type(input, 'TS-01')
    expect(await resultList(dialog).findByRole('option', { name: /Spoofed headlamp/ })).toBeInTheDocument()
    expect(oldSignal.aborted).toBe(true)
    await act(async () => resolveOld({ results: [{ id: 'old', name: 'Old response', type: 'projects', project: { id: 'old', name: 'Old project' } }], total: 1, nextOffset: null }))
    expect(within(dialog).queryByText('Old response')).not.toBeInTheDocument()
    expect(resultList(dialog).getByRole('option', { name: /Spoofed headlamp/ })).toBeInTheDocument()
  })

  it('does not override another open modal with the global shortcut', async () => {
    const { user } = renderApp('/projects')
    await user.click(screen.getByRole('button', { name: 'Create Project' }))
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('dialog', { name: 'Create Project' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: dialogName })).not.toBeInTheDocument()
  })

  it('loads additional pages and keeps the first results available', async () => {
    const api = createMockItemApi()
    for (let i = 0; i < 24; i++) await api.projects.create({ name: `Paging project ${i}` })
    const { user, input, dialog } = await openSearch('/projects', api)
    await user.type(input, 'Paging project')
    await waitFor(() => expect(resultList(dialog).getAllByRole('option')).toHaveLength(20))
    await user.click(within(dialog).getByRole('button', { name: 'Load more results' }))
    await waitFor(() => expect(resultList(dialog).getAllByRole('option')).toHaveLength(24))
    expect(within(dialog).queryByRole('button', { name: 'Load more results' })).not.toBeInTheDocument()
  })

  it('closes on a click outside the overlay', async () => {
    const { user } = await openSearch()
    await user.click(document.querySelector('[data-slot="dialog-overlay"]')!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
