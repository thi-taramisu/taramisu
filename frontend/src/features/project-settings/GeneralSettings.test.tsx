import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../App'

function renderGeneral() {
  render(
    <MemoryRouter initialEntries={['/projects/headlamp/settings']}>
      <App />
    </MemoryRouter>,
  )
}

describe('GeneralSettings', () => {
  it('shows the project name and description', () => {
    renderGeneral()

    expect(screen.getByLabelText('Name')).toHaveValue('Headlamp system (example)')
    expect(screen.getByLabelText('Description')).toHaveValue(
      'TARA of the headlamp system, the example project of the course.',
    )
  })

  it('requires a name that is not only spaces', async () => {
    const user = userEvent.setup()
    renderGeneral()

    const name = screen.getByLabelText('Name')
    expect(name).toBeRequired()
    await user.clear(name)
    expect(name).toBeInvalid()

    await user.type(name, '   ')
    expect(name).toBeInvalid()

    await user.type(name, 'Battery Security')
    expect(name).toBeValid()
  })
})
