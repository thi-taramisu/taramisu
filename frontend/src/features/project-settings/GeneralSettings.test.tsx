import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'

function renderGeneral() {
  render(
    <MemoryRouter initialEntries={['/projects/headlamp/settings']}>
      <App />
    </MemoryRouter>,
  )
}

describe('GeneralSettings', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('previews and removes an image', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL')
    const user = userEvent.setup()
    renderGeneral()

    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()

    const image = screen.getByLabelText('Image')
    await user.upload(image, new File(['image'], 'headlamp.png', { type: 'image/png' }))
    expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'blob:image')

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument()
    expect(image).toHaveValue('')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image')
  })

  it('only accepts PNG, JPEG and WebP images', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    // Without applyAccept, user-event uploads files the picker would hide, like choosing "All files".
    const user = userEvent.setup({ applyAccept: false })
    renderGeneral()

    const image = screen.getByLabelText('Image')
    expect(image).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp')

    await user.upload(image, new File(['notes'], 'notes.txt', { type: 'text/plain' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Only PNG, JPEG and WebP images are supported.')
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument()
    expect(image).toHaveValue('')

    await user.upload(image, new File(['image'], 'headlamp.webp', { type: 'image/webp' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByAltText('Preview')).toBeInTheDocument()
  })
})
