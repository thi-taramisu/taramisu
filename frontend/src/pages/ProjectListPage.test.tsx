import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { createMockItemApi } from '@/api/mocks/mockItemApi'
import { createMockProjectApi } from '@/api/mocks/mockProjectApi'
import { deferred } from '@/test/deferred'
import { renderApp } from '@/test/renderApp'

const confirmLabel = 'To confirm, type "Battery Security" in the box below'

/** Renders the project list with a fresh mock project API and waits until the projects are loaded. */
async function renderAt(path: string) {
  renderApp(path)
  await screen.findByRole('button', { name: 'Actions for Battery Security' })
}

describe('Main Page project management', () => {
  it('creates a project with a generated image when no file is uploaded', async () => {
    const user = userEvent.setup()
    await renderAt('/projects')

    await user.click(screen.getByRole('button', { name: 'Create Project' }))

    const dialog = screen.getByRole('dialog', { name: 'Create Project' })

    expect(dialog).toBeInTheDocument()

    const nameInput = within(dialog).getByRole('textbox', { name: 'Project name' })
    const createButton = within(dialog).getByRole('button', { name: 'Create' })

    expect(createButton).toBeDisabled()

    await user.type(nameInput, 'My New TARA Project')

    expect(createButton).toBeEnabled()

    await user.click(createButton)

    expect(screen.queryByRole('dialog', { name: 'Create Project' })).not.toBeInTheDocument()

    const allProjects = screen.getByRole('heading', { name: 'All Projects' }).closest('section')

    expect(allProjects).not.toBeNull()
    const row = (await within(allProjects!).findByText('My New TARA Project')).closest<HTMLElement>('[data-slot=card]')
    expect(within(row!).getByAltText('')).toHaveAttribute('src', expect.stringMatching(/^data:image\/svg\+xml[;,]/))
  })

  it('adds and removes a project from favorites', async () => {
    const user = userEvent.setup()
    await renderAt('/projects')

    const favorites = screen
      .getByRole('heading', { name: 'Favorites' })
      .closest('section')

    const allProjects = screen
      .getByRole('heading', { name: 'All Projects' })
      .closest('section')

    expect(favorites).not.toBeNull()
    expect(allProjects).not.toBeNull()

    // Vehicle Gateway is not a favorite initially.
    expect(within(favorites!).queryByText('Vehicle Gateway')).not.toBeInTheDocument()

    // Add Vehicle Gateway to favorites.
    await user.click(
      within(allProjects!).getByRole('button', {
        name: 'Add Vehicle Gateway to favorites',
      }),
    )

    expect(await within(favorites!).findByText('Vehicle Gateway')).toBeInTheDocument()

    expect(
      within(allProjects!).getByRole('button', {
        name: 'Remove Vehicle Gateway from favorites',
      }),
    ).toHaveAttribute('aria-pressed', 'true')

    // Remove Vehicle Gateway using its favorite card.
    await user.click(
      within(favorites!).getByRole('button', {
        name: 'Remove Vehicle Gateway from favorites',
      }),
    )

    await waitFor(() => expect(within(favorites!).queryByText('Vehicle Gateway')).not.toBeInTheDocument())

    // The project must still exist under All Projects.
    expect(within(allProjects!).getByText('Vehicle Gateway')).toBeInTheDocument()

    expect(
      within(allProjects!).getByRole('button', {
        name: 'Add Vehicle Gateway to favorites',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('deletes a project only after confirmation', async () => {
    const user = userEvent.setup()
    await renderAt('/projects')

    const favorites = screen
      .getByRole('heading', { name: 'Favorites' })
      .closest('section')!

    const allProjects = screen
      .getByRole('heading', { name: 'All Projects' })
      .closest('section')!

    // Battery Security initially exists in both sections.
    expect(within(favorites).getByText('Battery Security')).toBeInTheDocument()
    expect(within(allProjects).getByText('Battery Security')).toBeInTheDocument()

    // Open the actions menu and select Delete Project.
    await user.click(
      within(allProjects).getByRole('button', {
        name: 'Actions for Battery Security',
      }),
    )

    await user.click(
      await screen.findByRole('menuitem', { name: 'Delete Project' }),
    )

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete Battery Security',
    })

    // Cancel after typing must preserve the project.
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete Project' }),
    )
    await user.type(
      within(dialog).getByRole('textbox', { name: confirmLabel }),
      'Battery Security',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(within(allProjects).getByText('Battery Security')).toBeInTheDocument()

    // Reopening starts again at the first step with an empty field.
    await user.click(
      within(allProjects).getByRole('button', {
        name: 'Actions for Battery Security',
      }),
    )

    await user.click(
      await screen.findByRole('menuitem', { name: 'Delete Project' }),
    )

    const confirmationDialog = await screen.findByRole('alertdialog', {
      name: 'Delete Battery Security',
    })
    expect(within(confirmationDialog).queryByRole('textbox')).not.toBeInTheDocument()

    await user.click(
      within(confirmationDialog).getByRole('button', { name: 'Delete Project' }),
    )
    const input = within(confirmationDialog).getByRole('textbox', { name: confirmLabel })
    expect(input).toHaveValue('')

    // Confirm deletion by typing the project name.
    await user.type(input, 'Battery Security')
    await user.click(
      within(confirmationDialog).getByRole('button', {
        name: 'Delete Project',
      }),
    )

    // The deleted project must disappear from both sections.
    await waitFor(() => expect(
      within(allProjects).queryByText('Battery Security'),
    ).not.toBeInTheDocument())

    expect(
      within(favorites).queryByText('Battery Security'),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['Escape', false],
    ['Cancel', false],
    ['Escape', true],
    ['Cancel', true],
  ])(
    'returns focus to the same Actions button after %s (confirm step: %s)',
    async (dismissal, confirmStep) => {
      const user = userEvent.setup()
      await renderAt('/projects')

      const opener = screen.getByRole('button', {
        name: 'Actions for Battery Security',
      })
      opener.focus()
      await user.keyboard('{Enter}')
      await user.keyboard('{End}{Enter}')

      const dialog = await screen.findByRole('alertdialog', {
        name: 'Delete Battery Security',
      })
      if (confirmStep) {
        await user.click(
          within(dialog).getByRole('button', { name: 'Delete Project' }),
        )
      }
      if (dismissal === 'Escape') {
        await user.keyboard('{Escape}')
      } else {
        await user.click(within(dialog).getByRole('button', { name: dismissal }))
      }

      await waitFor(() => expect(opener).toHaveFocus())
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(opener).toBeInTheDocument()

      // Continue keyboard navigation from the restored position.
      await user.keyboard('{Enter}')
      expect(await screen.findByRole('menuitem', { name: 'Delete Project' }))
        .toBeInTheDocument()
      await user.keyboard('{Escape}')
    },
  )

  it('archives and restores a project while preserving its favorite status', async () => {
    const user = userEvent.setup()
    await renderAt('/projects')

    const favorites = screen
      .getByRole('heading', { name: 'Favorites' })
      .closest('section')!

    const allProjects = screen
      .getByRole('heading', { name: 'All Projects' })
      .closest('section')!

    // Battery Security is initially active and a favorite.
    expect(within(favorites).getByText('Battery Security')).toBeInTheDocument()
    expect(within(allProjects).getByText('Battery Security')).toBeInTheDocument()

    // Archive Battery Security through its actions menu.
    await user.click(
      within(allProjects).getByRole('button', {
        name: 'Actions for Battery Security',
      }),
    )

    await user.click(
      await screen.findByRole('menuitem', {
        name: 'Archive Project',
      }),
    )
    const archiveDialog = await screen.findByRole('alertdialog', { name: 'Archive Battery Security' })
    await user.click(within(archiveDialog).getByRole('button', { name: 'Archive Project' }))

    // Archived projects must disappear from the main overview.
    await waitFor(() => expect(
      within(allProjects).queryByText('Battery Security'),
    ).not.toBeInTheDocument())

    expect(
      within(favorites).queryByText('Battery Security'),
    ).not.toBeInTheDocument()

    // Switch to the archive view.
    await user.click(
      screen.getByRole('button', { name: 'Archive' }),
    )

    const archive = screen
      .getByRole('heading', { name: 'Archive' })
      .closest('section')!

    expect(within(archive).getByText('Battery Security')).toBeInTheDocument()

    // Restore Battery Security.
    await user.click(
      within(archive).getByRole('button', {
        name: 'Restore Battery Security',
      }),
    )

    await waitFor(() => expect(
      within(archive).queryByText('Battery Security'),
    ).not.toBeInTheDocument())

    // Switch back to Projects.
    await user.click(
      screen.getByRole('button', { name: 'Projects' }),
    )

    const restoredProjects = screen
      .getByRole('heading', { name: 'All Projects' })
      .closest('section')!

    const restoredFavorites = screen
      .getByRole('heading', { name: 'Favorites' })
      .closest('section')!

    expect(
      within(restoredProjects).getByText('Battery Security'),
    ).toBeInTheDocument()

    // The favorite status must remain unchanged.
    expect(
      within(restoredFavorites).getByText('Battery Security'),
    ).toBeInTheDocument()

    expect(
      within(restoredProjects).getByRole('button', {
        name: 'Remove Battery Security from favorites',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('allows archiving and deleting the example project', async () => {
    const user = userEvent.setup()
    await renderAt('/projects')

    await user.click(screen.getByRole('button', { name: 'Actions for Headlamp System' }))

    expect(await screen.findByRole('menuitem', { name: 'Archive Project' })).not.toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: 'Delete Project' })).not.toHaveAttribute('data-disabled')
  })

  it('opens the workspace of the example project and the settings of the others', async () => {
    await renderAt('/projects')

    expect(screen.getByRole('link', { name: 'Headlamp System (example)' })).toHaveAttribute('href', '/projects/headlamp')
    expect(screen.getByRole('link', { name: 'Battery Security settings' })).toHaveAttribute(
      'href',
      '/projects/battery-security/settings',
    )
  })

  it('shows an error with a retry when the projects cannot be loaded', async () => {
    const user = userEvent.setup()
    const projects = createMockProjectApi()
    const list = projects.list
    let fail = true
    projects.list = () => (fail ? Promise.reject(new ApiError(500, 'Server error.')) : list())
    renderApp('/projects', createMockItemApi(), projects)

    expect(await screen.findByRole('alert')).toHaveTextContent('The projects could not be loaded.')

    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('button', { name: 'Actions for Battery Security' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('toggles a favorite back and forth on quick clicks, before the requests finish', async () => {
    const user = userEvent.setup()
    const projects = createMockProjectApi()
    const setFavorite = projects.setFavorite
    const sent: boolean[] = []
    const request = deferred()
    projects.setFavorite = async (projectId, favorite) => {
      sent.push(favorite)
      await request.promise
      return setFavorite(projectId, favorite)
    }
    renderApp('/projects', createMockItemApi(), projects)

    await screen.findByRole('button', { name: 'Add Vehicle Gateway to favorites' })
    const allProjects = screen.getByRole('heading', { name: 'All Projects' }).closest('section')!
    await user.click(within(allProjects).getByRole('button', { name: 'Add Vehicle Gateway to favorites' }))
    await user.click(within(allProjects).getByRole('button', { name: 'Remove Vehicle Gateway from favorites' }))
    request.release()

    await waitFor(() => expect(sent).toEqual([true, false]))
    expect(within(allProjects).getByRole('button', { name: 'Add Vehicle Gateway to favorites' }))
      .toHaveAttribute('aria-pressed', 'false')
    expect(await projects.get('vehicle-gateway')).toMatchObject({ favorite: false })
  })

  it('undoes the star and shows an error when saving a favorite fails', async () => {
    const user = userEvent.setup()
    const projects = createMockProjectApi()
    projects.setFavorite = () => Promise.reject(new ApiError(500, 'Server error.'))
    renderApp('/projects', createMockItemApi(), projects)

    await user.click(await screen.findByRole('button', { name: 'Add Vehicle Gateway to favorites' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The change could not be saved.')
    expect(screen.getByRole('button', { name: 'Add Vehicle Gateway to favorites' }))
      .toHaveAttribute('aria-pressed', 'false')
  })

  it('deletes only once when the confirm button is clicked twice', async () => {
    const user = userEvent.setup()
    const projects = createMockProjectApi()
    const remove = projects.delete
    let calls = 0
    const request = deferred()
    projects.delete = async (projectId) => {
      calls += 1
      await request.promise
      return remove(projectId)
    }
    renderApp('/projects', createMockItemApi(), projects)

    await user.click(await screen.findByRole('button', { name: 'Actions for Battery Security' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Project' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Battery Security' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete Project' }))
    await user.type(within(dialog).getByRole('textbox', { name: confirmLabel }), 'Battery Security')
    const confirm = within(dialog).getByRole('button', { name: 'Delete Project' })
    await user.click(confirm)
    await user.click(confirm)
    request.release()

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Actions for Battery Security' })).not.toBeInTheDocument())
    expect(calls).toBe(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
