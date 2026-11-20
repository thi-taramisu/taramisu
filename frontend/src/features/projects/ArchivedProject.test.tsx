import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { mockProjects } from '@/api/mocks/data/projects'
import { createMockItemApi } from '@/api/mocks/mockItemApi'
import { createMockProjectApi } from '@/api/mocks/mockProjectApi'
import { renderApp } from '@/test/renderApp'

const project = '/projects/headlamp'

function renderArchived(path: string) {
  const projects = createMockProjectApi(mockProjects.map((p) => (p.id === 'headlamp' ? { ...p, archived: true } : p)))
  return renderApp(path, createMockItemApi(), projects)
}

/** The banner appears once the project is loaded, so the page has its final read-only state then. */
function findBanner() {
  return screen.findByText(/This project is archived and read-only\./)
}

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const section = (name: string) => within(screen.getByRole('region', { name }))

describe('archived project', () => {
  it('shows the item page read-only', async () => {
    renderArchived(`${project}/items/i-01`)

    await findBanner()
    expect(within(tree()).getByRole('button', { name: 'New' })).toBeDisabled()
    expect(await screen.findByRole('textbox', { name: 'Name *' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Boundary *' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete item' })).not.toBeInTheDocument()
  })

  it('lists the assets of an item without "Add Asset"', async () => {
    renderArchived(`${project}/items/i-01/assets`)
    await findBanner()

    expect(await screen.findByRole('link', { name: 'Headlamp on/off command' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Asset' })).not.toBeInTheDocument()
  })

  it('lists the relations of a damage scenario without changing them', async () => {
    renderArchived(`${project}/damage-scenarios/ds-01/relations`)
    await findBanner()

    await screen.findByRole('region', { name: 'Assets' })
    expect(section('Assets').getByRole('link', { name: 'Headlamp on/off command' })).toBeInTheDocument()
    expect(section('Assets').getByRole('button', { name: 'A-01 Integrity', pressed: true })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add Asset' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Threat Scenario' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove link to/ })).not.toBeInTheDocument()
  })

  it('shows the impact ratings disabled, but the rationale can still be read', async () => {
    const { user } = renderArchived(`${project}/damage-scenarios/ds-01/impact`)
    await findBanner()

    const safety = within(await screen.findByRole('radiogroup', { name: 'Safety' }))
    expect(safety.getByRole('radio', { name: 'Severe' })).toBeChecked()
    expect(safety.getByRole('radio', { name: 'Severe' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear Safety' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Safety Rationale' }))
    const rationale = screen.getByRole('textbox', { name: 'Safety rationale' })
    expect(rationale).toHaveValue('Severity S3 from the HARA of the headlamp system.')
    expect(rationale).toBeDisabled()
  })

  it('shows the threat scenario definition disabled', async () => {
    renderArchived(`${project}/threat-scenarios/ts-01`)
    await findBanner()

    expect(await screen.findByLabelText('Elicitation')).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Name *' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('shows the attack path definition and steps disabled', async () => {
    renderArchived(`${project}/attack-paths/ap-01`)
    await findBanner()

    expect(await screen.findByRole('textbox', { name: 'Name *' })).toBeDisabled()
    expect(screen.getByLabelText('Analysis Approach')).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Partial Attack Path/ })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Step 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Step' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove step 1' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('shows the attack path rating disabled, with its feasibility', async () => {
    renderArchived(`${project}/attack-paths/ap-01/rating`)
    await findBanner()

    const elapsedTime = within(await screen.findByRole('radiogroup', { name: 'Elapsed Time' }))
    expect(elapsedTime.getByRole('radio', { name: '≤6 months 17 points' })).toBeChecked()
    expect(elapsedTime.getByRole('radio', { name: '≤6 months 17 points' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear Elapsed Time' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Rationale' })).toBeDisabled()
    expect(screen.getByText('Low feasibility')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('shows the general settings disabled, but keeps Restore and the members editable', async () => {
    const { user } = renderArchived(`${project}/settings`)

    await findBanner()
    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(section('Danger Zone').getByRole('button', { name: 'Restore Project' })).toBeEnabled()

    await user.click(screen.getByRole('link', { name: 'Members' }))
    expect(await screen.findByRole('button', { name: 'Add member' })).toBeEnabled()
  })

  it('makes the workspace read-only after archiving in the settings, and editable again after restoring', async () => {
    const { user } = renderApp(`${project}/settings`)

    const lifecycle = within(await screen.findByRole('region', { name: 'Danger Zone' }))
    await user.click(lifecycle.getByRole('button', { name: 'Archive Project' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Headlamp System' })
    await user.click(within(dialog).getByRole('button', { name: 'Archive Project' }))
    await findBanner()

    await user.click(screen.getByRole('link', { name: '← Back' }))
    await findBanner()
    expect(within(tree()).getByRole('button', { name: 'New' })).toBeDisabled()

    await user.click(screen.getByRole('link', { name: 'Settings' }))
    const restore = within(await screen.findByRole('region', { name: 'Danger Zone' })).getByRole('button', { name: 'Restore Project' })
    await user.click(restore)
    await screen.findByRole('button', { name: 'Save' })
    await user.click(await screen.findByRole('link', { name: '← Back' }))

    await waitFor(() => expect(within(tree()).getByRole('button', { name: 'New' })).toBeEnabled())
    expect(screen.queryByText(/This project is archived/)).not.toBeInTheDocument()
  })
})

describe('project workspace', () => {
  it('shows the not found page for a deleted project', async () => {
    const projects = createMockProjectApi()
    await projects.delete('headlamp')
    renderApp(project, createMockItemApi(), projects)

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Project elements' })).not.toBeInTheDocument()
  })

  it('offers no editing while the project cannot be loaded, and a retry', async () => {
    const projects = createMockProjectApi()
    const get = projects.get
    projects.get = () => Promise.reject(new ApiError(500, 'Server error'))
    const { user } = renderApp(project, createMockItemApi(), projects)

    expect(await screen.findByRole('alert')).toHaveTextContent('The project could not be loaded, so it cannot be edited.')
    expect(within(tree()).getByRole('button', { name: 'New' })).toBeDisabled()

    projects.get = get
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(within(tree()).getByRole('button', { name: 'New' })).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
