import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../App'

function renderAssets() {
  render(
    <MemoryRouter initialEntries={['/assets']}>
      <App />
    </MemoryRouter>,
  )
}

describe('AssetsPage', () => {
  it('renders the headlamp assets table', () => {
    renderAssets()

    expect(screen.getByRole('heading', { name: /assets/i })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Headlamp on/off command' })).toBeInTheDocument()
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
