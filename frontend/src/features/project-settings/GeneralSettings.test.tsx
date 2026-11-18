import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { createMockItemApi } from '@/api/mocks/mockItemApi'
import { createMockProjectApi } from '@/api/mocks/mockProjectApi'
import { renderApp } from '@/test/renderApp'
import { MAX_IMAGE_SIZE } from '@/lib/imageUpload'

/** Waits for Save, which appears once the project is loaded and known to be editable. */
async function renderGeneral(projects = createMockProjectApi(), projectId = 'headlamp') {
  const rendered = renderApp(`/projects/${projectId}/settings`, createMockItemApi(), projects)
  await screen.findByRole('button', { name: 'Save' })
  return rendered
}

describe('GeneralSettings', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the project name and description', async () => {
    await renderGeneral()

    expect(screen.getByLabelText('Name')).toHaveValue('Headlamp System')
    expect(screen.getByLabelText('Description')).toHaveValue('Headlamp cybersecurity analysis')
  })

  it('opens the settings of a project other than the example', async () => {
    await renderGeneral(createMockProjectApi(), 'battery-security')

    expect(screen.getByLabelText('Name')).toHaveValue('Battery Security')
    expect(within(screen.getByRole('banner')).getByText('Battery Security')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Back' })).toHaveAttribute('href', '/projects')
  })

  it('saves a new name and description and shows them in the header', async () => {
    const projects = createMockProjectApi()
    const { user } = await renderGeneral(projects, 'battery-security')

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Battery Pack')
    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), 'Pack TARA')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByText('Battery Pack')).toBeInTheDocument()
    expect(await projects.get('battery-security')).toMatchObject({ name: 'Battery Pack', description: 'Pack TARA' })

    await user.type(screen.getByLabelText('Name'), ' 2')
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
  })

  it('shows saving while the request runs and an error when it fails', async () => {
    const projects = createMockProjectApi()
    let reject: ((error: unknown) => void) | undefined
    projects.update = () => new Promise((_, fail) => { reject = fail })
    const { user } = await renderGeneral(projects, 'battery-security')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()

    act(() => reject?.(new ApiError(403, 'Forbidden.')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only editors and owners can change the project.')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    await user.type(screen.getByLabelText('Name'), 'x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error with a retry when the project cannot be loaded', async () => {
    const projects = createMockProjectApi()
    const get = projects.get
    let fail = true
    projects.get = (projectId) => (fail ? Promise.reject(new ApiError(500, 'Server error.')) : get(projectId))
    const { user } = renderApp('/projects/headlamp/settings', createMockItemApi(), projects)

    expect(await screen.findByRole('alert')).toHaveTextContent('The project could not be loaded.')
    expect(screen.queryByRole('region', { name: 'Danger Zone' })).not.toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByLabelText('Name')).toHaveValue('Headlamp System')
    expect(await screen.findByRole('region', { name: 'Danger Zone' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows Not found for an unknown project', async () => {
    renderApp('/projects/unknown/settings', createMockItemApi(), createMockProjectApi())

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('requires a name that is not only spaces', async () => {
    const user = userEvent.setup()
    await renderGeneral()

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
    await renderGeneral()

    const generatedImage = screen.getByAltText('').getAttribute('src')
    expect(generatedImage).toMatch(/^data:image\/svg\+xml[;,]/)
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()

    const image = screen.getByLabelText('Image')
    await user.upload(image, new File(['image'], 'headlamp.png', { type: 'image/png' }))
    expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'blob:image')

    expect(screen.queryByAltText('')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByAltText('')).toHaveAttribute('src', generatedImage)
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument()
    expect(image).toHaveValue('')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image')
  })

  it('only accepts PNG, JPEG and WebP images', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    // Without applyAccept, user-event uploads files the picker would hide, like choosing "All files".
    const user = userEvent.setup({ applyAccept: false })
    await renderGeneral()

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

  it('rejects images larger than the size limit', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    const user = userEvent.setup()
    await renderGeneral()

    const image = screen.getByLabelText('Image')
    const large = new File(['image'], 'large.png', { type: 'image/png' })
    Object.defineProperty(large, 'size', { value: MAX_IMAGE_SIZE + 1 })
    await user.upload(image, large)
    expect(screen.getByRole('alert')).toHaveTextContent('Images can be at most 5 MB.')
    expect(image).toBeInvalid()
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument()
    expect(image).toHaveValue('')

    const small = new File(['image'], 'small.png', { type: 'image/png' })
    Object.defineProperty(small, 'size', { value: MAX_IMAGE_SIZE })
    await user.upload(image, small)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByAltText('Preview')).toBeInTheDocument()
  })
})
