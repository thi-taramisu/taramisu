import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ArchiveProjectDialog } from './ArchiveProjectDialog'

function renderDialog() {
  const onConfirm = vi.fn<() => void>()
  const onOpenChange = vi.fn<(open: boolean) => void>()
  render(
    <ArchiveProjectDialog projectName="Battery Security" onOpenChange={onOpenChange} onConfirm={onConfirm} />,
  )
  return { dialog: screen.getByRole('alertdialog', { name: 'Archive Battery Security' }), onConfirm, onOpenChange }
}

describe('ArchiveProjectDialog', () => {
  it('explains that archiving can be undone', () => {
    const { dialog } = renderDialog()

    expect(dialog).toHaveAccessibleDescription(
      'This will make the project read-only for all members. Owners can restore it at any time.',
    )
  })

  it('confirms in one step', async () => {
    const user = userEvent.setup()
    const { dialog, onConfirm, onOpenChange } = renderDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Archive Project' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not archive on Cancel', async () => {
    const user = userEvent.setup()
    const { dialog, onConfirm, onOpenChange } = renderDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
