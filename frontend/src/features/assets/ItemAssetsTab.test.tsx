import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'

const renderAssets = () => renderApp('/projects/headlamp/items/i-01/assets')

describe('ItemAssetsTab', () => {
  it('renders the headlamp assets table with links to the assets', async () => {
    renderAssets()

    expect(await screen.findByRole('cell', { name: 'Headlamp on/off command' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByRole('link', { name: 'Camera image data' })).toHaveAttribute(
      'href',
      '/projects/headlamp/assets/a-03',
    )
  })

  it('adds an asset through the dialog', async () => {
    const { user, api } = renderAssets()

    await user.click(await screen.findByRole('button', { name: 'Add Asset' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'LED driver config')
    await user.type(within(dialog).getByLabelText('Component'), 'Power switch actuator')
    await user.click(within(dialog).getByLabelText('Integrity'))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const row = (await screen.findByRole('cell', { name: 'LED driver config' })).closest('tr')!
    expect(within(row).getByText('A-05')).toBeInTheDocument()
    expect(within(row).getByText('Power switch actuator')).toBeInTheDocument()
    expect(within(row).getByLabelText('Properties I')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Assets (5)' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Project elements' })).getByRole('link', { name: 'A-05 LED driver config' })).toBeInTheDocument()
    expect(await api.content.assets('headlamp', 'i-01')).toHaveLength(5)
  })
})
