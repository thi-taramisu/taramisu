import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { mockProjects } from '@/api/mocks/data/projects'
import { createMockItemApi } from '@/api/mocks/mockItemApi'
import { createMockProjectApi } from '@/api/mocks/mockProjectApi'
import type { ProjectRole } from '@/api/models/project'
import { deferred } from '@/test/deferred'
import { renderApp } from '@/test/renderApp'

const settings = '/projects/headlamp/settings'

function projectsWithHeadlampRole(role: ProjectRole) {
  return createMockProjectApi(mockProjects.map((project) => (project.id === 'headlamp' ? { ...project, role } : project)))
}

function renderSettings(projects = createMockProjectApi()) {
  return renderApp(settings, createMockItemApi(), projects)
}

async function confirmDelete(user: ReturnType<typeof renderApp>['user'], lifecycle: HTMLElement) {
  await user.click(within(lifecycle).getByRole('button', { name: 'Delete Project' }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete Headlamp System' })
  await user.click(within(dialog).getByRole('button', { name: 'Delete Project' }))
  await user.type(
    within(dialog).getByRole('textbox', { name: 'To confirm, type "Headlamp System" in the box below' }),
    'Headlamp System',
  )
  return within(dialog).getByRole('button', { name: 'Delete Project' })
}

function section() {
  return screen.findByRole('region', { name: 'Danger Zone' })
}

describe('ProjectLifecycleSettings', () => {
  it('shows archive and delete to Owners', async () => {
    renderSettings()

    const lifecycle = await section()
    expect(within(lifecycle).getByRole('button', { name: 'Archive Project' })).toBeEnabled()
    expect(within(lifecycle).getByRole('button', { name: 'Delete Project' })).toBeEnabled()
  })

  it.each<ProjectRole>(['EDITOR', 'REVIEWER', 'VIEWER'])('hides both actions from the role %s', async (role) => {
    const projects = projectsWithHeadlampRole(role)
    // Wait for the page's own request, so the section had the chance to appear.
    const get = projects.get
    let loaded: Promise<unknown> | undefined
    projects.get = (projectId) => (loaded = get(projectId))
    renderSettings(projects)

    await waitFor(() => expect(loaded).toBeDefined())
    await act(async () => {
      await loaded
    })
    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Danger Zone' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive Project' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Project' })).not.toBeInTheDocument()
  })

  it('keeps the project active when archiving is cancelled', async () => {
    const { projects, user } = renderSettings()
    const lifecycle = await section()
    const archiveButton = within(lifecycle).getByRole('button', { name: 'Archive Project' })

    await user.click(archiveButton)
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Headlamp System' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(archiveButton).toHaveFocus())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await projects.get('headlamp')).toMatchObject({ archived: false })
  })

  it('archives the project after the confirmation and restores it', async () => {
    const { projects, user } = renderSettings()
    const lifecycle = await section()

    await user.click(within(lifecycle).getByRole('button', { name: 'Archive Project' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Headlamp System' })
    await user.click(within(dialog).getByRole('button', { name: 'Archive Project' }))

    expect(await within(lifecycle).findByRole('button', { name: 'Restore Project' })).toBeInTheDocument()
    expect(within(lifecycle).getByText(/This project is archived and read-only/)).toBeInTheDocument()
    expect(await projects.get('headlamp')).toMatchObject({ archived: true })

    await user.click(within(lifecycle).getByRole('button', { name: 'Restore Project' }))

    expect(await within(lifecycle).findByRole('button', { name: 'Archive Project' })).toBeInTheDocument()
    expect(await projects.get('headlamp')).toMatchObject({ archived: false })
  })

  it('deletes the project after the confirmation and returns to the project list', async () => {
    const { projects, user } = renderSettings()
    const lifecycle = await section()

    await user.click(within(lifecycle).getByRole('button', { name: 'Delete Project' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Headlamp System' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete Project' }))
    await user.type(
      within(dialog).getByRole('textbox', { name: 'To confirm, type "Headlamp System" in the box below' }),
      'Headlamp System',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Delete Project' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/projects$/))
    expect(await screen.findByRole('button', { name: 'Actions for Battery Security' })).toBeInTheDocument()
    expect(screen.queryByText('Headlamp System')).not.toBeInTheDocument()
    expect((await projects.list()).map((project) => project.id)).not.toContain('headlamp')
  })

  it('returns focus to the delete button when deleting is cancelled', async () => {
    const { projects, user } = renderSettings()
    const lifecycle = await section()
    const deleteButton = within(lifecycle).getByRole('button', { name: 'Delete Project' })

    await user.click(deleteButton)
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Headlamp System' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(deleteButton).toHaveFocus())
    expect(await projects.get('headlamp')).toMatchObject({ archived: false })
  })

  it('shows the not found page for the settings of a deleted project', async () => {
    const projects = createMockProjectApi()
    await projects.delete('headlamp')
    renderSettings(projects)

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('shows an error when archiving fails', async () => {
    const projects = createMockProjectApi()
    projects.archive = () => Promise.reject(new ApiError(500, 'Server error.'))
    const { user } = renderSettings(projects)
    const lifecycle = await section()

    await user.click(within(lifecycle).getByRole('button', { name: 'Archive Project' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Headlamp System' })
    await user.click(within(dialog).getByRole('button', { name: 'Archive Project' }))

    expect(await within(lifecycle).findByRole('alert')).toHaveTextContent('The change could not be saved.')
    expect(within(lifecycle).getByRole('button', { name: 'Archive Project' })).toBeEnabled()
  })

  it('deletes only once when the confirm button is clicked twice', async () => {
    const projects = createMockProjectApi()
    const remove = projects.delete
    const request = deferred()
    let calls = 0
    projects.delete = async (projectId) => {
      calls += 1
      await request.promise
      return remove(projectId)
    }
    const { user } = renderSettings(projects)

    const confirm = await confirmDelete(user, await section())
    await user.click(confirm)
    await user.click(confirm)
    request.release()

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/projects$/))
    expect(calls).toBe(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('hides an earlier error once a retry succeeds', async () => {
    const projects = createMockProjectApi()
    const archive = projects.archive
    let fail = true
    projects.archive = (projectId) => (fail ? Promise.reject(new ApiError(500, 'Server error.')) : archive(projectId))
    const { user } = renderSettings(projects)
    const lifecycle = await section()

    async function archiveWithConfirmation() {
      await user.click(within(lifecycle).getByRole('button', { name: 'Archive Project' }))
      const dialog = await screen.findByRole('alertdialog', { name: 'Archive Headlamp System' })
      await user.click(within(dialog).getByRole('button', { name: 'Archive Project' }))
    }

    await archiveWithConfirmation()
    expect(await within(lifecycle).findByRole('alert')).toBeInTheDocument()

    fail = false
    await archiveWithConfirmation()

    expect(await within(lifecycle).findByRole('button', { name: 'Restore Project' })).toBeInTheDocument()
    expect(within(lifecycle).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error with a retry when the project cannot be loaded', async () => {
    const projects = createMockProjectApi()
    const get = projects.get
    let fail = true
    projects.get = (projectId) => (fail ? Promise.reject(new ApiError(500, 'Server error.')) : get(projectId))
    const { user } = renderSettings(projects)

    expect(await screen.findByRole('alert')).toHaveTextContent('The archive and delete options could not be loaded.')

    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await section()).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
