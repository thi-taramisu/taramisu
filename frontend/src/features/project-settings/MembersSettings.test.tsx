import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../App'

function renderMembers() {
  render(
    <MemoryRouter initialEntries={['/projects/headlamp/settings/members']}>
      <App />
    </MemoryRouter>,
  )
}

function row(email: string) {
  return screen.getByRole('cell', { name: email }).closest('tr')!
}

describe('MembersSettings', () => {
  it('lists the members with role and date added', () => {
    renderMembers()

    expect(screen.getByRole('combobox', { name: 'Role for sam@example.com' })).toHaveDisplayValue('Editor')
    expect(within(row('kim@example.com')).getByText('10/10/2026')).toBeInTheDocument()
  })

  it('adds a member through the dialog', async () => {
    const user = userEvent.setup()
    renderMembers()

    await user.click(screen.getByRole('button', { name: 'Add member' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Email'), 'lee@example.com')
    expect(within(dialog).getByLabelText('Role')).toHaveDisplayValue('Viewer')
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'Reviewer')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Role for lee@example.com' })).toHaveDisplayValue('Reviewer')
  })

  it('removes a member only after confirmation', async () => {
    const user = userEvent.setup()
    renderMembers()

    await user.click(screen.getByRole('button', { name: 'Remove kim@example.com' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('cell', { name: 'kim@example.com' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove kim@example.com' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    expect(screen.queryByRole('cell', { name: 'kim@example.com' })).not.toBeInTheDocument()
  })

  it('changes the role of a member', async () => {
    const user = userEvent.setup()
    renderMembers()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Role for alex@example.com' }), 'Reviewer')

    expect(screen.getByRole('combobox', { name: 'Role for alex@example.com' })).toHaveDisplayValue('Reviewer')
    expect(screen.getByRole('combobox', { name: 'Role for sam@example.com' })).toHaveDisplayValue('Editor')
  })
})
