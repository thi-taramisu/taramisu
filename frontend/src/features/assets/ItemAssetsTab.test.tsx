import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../App'

function renderAssets() {
  render(
    <MemoryRouter initialEntries={['/projects/headlamp/items/i-01/assets']}>
      <App />
    </MemoryRouter>,
  )
}

describe('ItemAssetsTab', () => {
  it('renders the headlamp assets table with links to the assets', () => {
    renderAssets()

    expect(screen.getByRole('cell', { name: 'Headlamp on/off command' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByRole('link', { name: 'Camera image data' })).toHaveAttribute(
      'href',
      '/projects/headlamp/assets/a-03',
    )
  })

  it('adds an asset through the dialog', async () => {
    const user = userEvent.setup()
    renderAssets()

    await user.click(screen.getByRole('button', { name: 'Add asset' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'LED driver config')
    await user.type(within(dialog).getByLabelText('Component'), 'Power switch actuator')
    await user.click(within(dialog).getByLabelText('Integrity'))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const row = screen.getByRole('cell', { name: 'LED driver config' }).closest('tr')!
    expect(within(row).getByText('Power switch actuator')).toBeInTheDocument()
    expect(within(row).getByText('I')).toBeInTheDocument()
  })
})
