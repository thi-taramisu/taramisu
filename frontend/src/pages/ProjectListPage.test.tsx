import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ProjectListPage } from './ProjectListPage'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ProjectListPage />
    </MemoryRouter>,
  )
}

describe('Main Page project management', () => {
  it('creates a project through the dialog', async () => {
    const user = userEvent.setup()
    renderAt('/projects')

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
    expect(within(allProjects!).getByText('My New TARA Project')).toBeInTheDocument()
  })

  it('adds and removes a project from favorites', async () => {
    const user = userEvent.setup()
    renderAt('/projects')

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

    expect(within(favorites!).getByText('Vehicle Gateway')).toBeInTheDocument()

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

    expect(within(favorites!).queryByText('Vehicle Gateway')).not.toBeInTheDocument()

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
    renderAt('/projects')

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

    const dialog = await screen.findByRole('dialog', {
      name: 'Delete Project?',
    })

    expect(within(dialog).getByText('Battery Security')).toBeInTheDocument()

    // Cancel must preserve the project.
    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )

    expect(
      screen.queryByRole('dialog', { name: 'Delete Project?' }),
    ).not.toBeInTheDocument()

    expect(within(allProjects).getByText('Battery Security')).toBeInTheDocument()

    // Reopen the actions menu.
    await user.click(
      within(allProjects).getByRole('button', {
        name: 'Actions for Battery Security',
      }),
    )

    await user.click(
      await screen.findByRole('menuitem', { name: 'Delete Project' }),
    )

    const confirmationDialog = await screen.findByRole('dialog', {
      name: 'Delete Project?',
    })

    // Confirm deletion.
    await user.click(
      within(confirmationDialog).getByRole('button', {
        name: 'Delete Project',
      }),
    )

    // The deleted project must disappear from both sections.
    expect(
      within(allProjects).queryByText('Battery Security'),
    ).not.toBeInTheDocument()

    expect(
      within(favorites).queryByText('Battery Security'),
    ).not.toBeInTheDocument()
  })

  it.each(['Escape', 'Cancel', 'Close'])(
    'returns focus to the same Actions button after %s',
    async (dismissal) => {
      const user = userEvent.setup()
      renderAt('/projects')

      const opener = screen.getByRole('button', {
        name: 'Actions for Battery Security',
      })
      opener.focus()
      await user.keyboard('{Enter}')
      await user.keyboard('{End}{Enter}')

      const dialog = await screen.findByRole('dialog', {
        name: 'Delete Project?',
      })
      if (dismissal === 'Escape') {
        await user.keyboard('{Escape}')
      } else {
        await user.click(within(dialog).getByRole('button', { name: dismissal }))
      }

      await waitFor(() => expect(opener).toHaveFocus())
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
    renderAt('/projects')

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

    // Archived projects must disappear from the main overview.
    expect(
      within(allProjects).queryByText('Battery Security'),
    ).not.toBeInTheDocument()

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

    expect(
      within(archive).queryByText('Battery Security'),
    ).not.toBeInTheDocument()

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
})
