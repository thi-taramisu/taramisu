import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectImageInput } from './ProjectImageInput'

function renderWithSavedImage() {
  const { container } = render(
    <form>
      <ProjectImageInput defaultValue="/images/headlamp.png" />
    </form>,
  )
  return () => container.querySelector('input[name="removeImage"]')
}

describe('ProjectImageInput', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('submits the removal of the saved image', async () => {
    const user = userEvent.setup()
    const removeImage = renderWithSavedImage()

    expect(screen.getByAltText('Preview')).toHaveAttribute('src', '/images/headlamp.png')
    expect(removeImage()).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument()
    expect(removeImage()).toHaveValue('true')
  })

  it('keeps the saved image removed after an invalid file', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const removeImage = renderWithSavedImage()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.upload(screen.getByLabelText('Image'), new File(['notes'], 'notes.txt', { type: 'text/plain' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument()
    expect(removeImage()).toHaveValue('true')
  })

  it('replaces the removed image with a new file', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    const user = userEvent.setup()
    const removeImage = renderWithSavedImage()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.upload(screen.getByLabelText('Image'), new File(['image'], 'headlamp.png', { type: 'image/png' }))
    expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'blob:image')
    expect(removeImage()).not.toBeInTheDocument()
  })
})
