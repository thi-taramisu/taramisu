import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteProjectDialog } from './DeleteProjectDialog'

const confirmLabel = 'To confirm, type "Battery Security" in the box below'

function renderDialog(onConfirm = vi.fn<() => void>()) {
  render(
    <DeleteProjectDialog
      projectName="Battery Security"
      onOpenChange={() => {}}
      onConfirm={onConfirm}
    />,
  )
  return {
    dialog: screen.getByRole('dialog', { name: 'Delete Battery Security' }),
    onConfirm,
  }
}

async function openConfirmStep() {
  const user = userEvent.setup()
  const { dialog, onConfirm } = renderDialog()
  await user.click(within(dialog).getByRole('button', { name: 'Delete Project' }))
  return {
    user,
    onConfirm,
    input: within(dialog).getByRole('textbox', { name: confirmLabel }),
    deleteButton: within(dialog).getByRole('button', { name: 'Delete Project' }),
  }
}

describe('DeleteProjectDialog', () => {
  it('warns that everything is permanently lost', () => {
    const { dialog } = renderDialog()

    expect(dialog).toHaveAccessibleDescription(
      'This will permanently delete the project, including all of its items, their content, and its stored '
      + 'files. Everything will be permanently lost and cannot be restored.',
    )
  })

  it('asks for the project name only after the first step', async () => {
    const user = userEvent.setup()
    const { dialog, onConfirm } = renderDialog()

    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
    const deleteButton = within(dialog).getByRole('button', { name: 'Delete Project' })
    expect(deleteButton).toBeEnabled()

    await user.click(deleteButton)

    expect(onConfirm).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('textbox', { name: confirmLabel })).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Delete Project' })).toBeDisabled()
    expect(within(dialog).queryByText(/permanently lost/)).not.toBeInTheDocument()
    expect(dialog).not.toHaveAttribute('aria-describedby')
  })

  it('keeps the delete button disabled while the field is empty', async () => {
    const { deleteButton } = await openConfirmStep()

    expect(deleteButton).toBeDisabled()
  })

  it.each([
    ['a wrong name', 'Battery'],
    ['different capitalisation', 'battery security'],
    ['an extra space', 'Battery Security '],
  ])('keeps the delete button disabled for %s', async (_case, typed) => {
    const { user, input, deleteButton, onConfirm } = await openConfirmStep()

    await user.type(input, `${typed}{Enter}`)

    expect(deleteButton).toBeDisabled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('enables the delete button for the exact name and confirms on click', async () => {
    const { user, input, deleteButton, onConfirm } = await openConfirmStep()

    await user.type(input, 'Battery Security')
    expect(deleteButton).toBeEnabled()

    await user.click(deleteButton)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('confirms with Enter once the exact name is typed', async () => {
    const { user, input, onConfirm } = await openConfirmStep()

    await user.type(input, 'Battery Security{Enter}')

    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
