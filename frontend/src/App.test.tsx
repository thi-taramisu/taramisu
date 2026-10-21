
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'
import { ENTITY_TYPES, type EntityType } from './features/workspace/entities'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const project = '/projects/headlamp'

describe('routing', () => {
  it('redirects / to the project list', () => {
    renderAt('/')

    expect(screen.getByRole('heading', { name: 'Favorites' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All Projects' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /headlamp system \(example\)/i })).toHaveAttribute('href', project)
  })

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

  it('shows the workspace with the element tree', () => {
    renderAt(project)

    const tree = screen.getByRole('navigation', { name: 'Project elements' })
    expect(within(tree).getByRole('link', { name: /I-01 Headlamp system/ })).toHaveAttribute(
      'href',
      `${project}/items/i-01`,
    )
    expect(within(tree).getByRole('link', { name: /AP-02/ })).toHaveAttribute('href', `${project}/attack-paths/ap-02`)
  })

  it('shows the item definition diagram on the item route', () => {
    renderAt(`${project}/items/i-01`)

    expect(screen.getByRole('heading', { name: 'I-01 Headlamp system' })).toBeInTheDocument()
    expect(screen.getByText('Gateway ECU')).toBeInTheDocument()
    expect(screen.getByText('Item boundary: Headlamp system')).toBeInTheDocument()
  })

  it.each(
    (Object.keys(ENTITY_TYPES) as EntityType[]).flatMap((type) =>
      ENTITY_TYPES[type].tabs.filter((t) => t.path).map((t) => [type, t.path, t.label] as const),
    ),
  )('routes %s tab "%s"', (type, path, label) => {
    renderAt(`${project}/${type}/x-01/${path}`)

    const tabs = screen.getByRole('navigation', { name: `${ENTITY_TYPES[type].label} tabs` })
    expect(within(tabs).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  })

  it('switches between tabs', async () => {
    const user = userEvent.setup()
    renderAt(`${project}/threat-scenarios/ts-01`)

    await user.click(screen.getByRole('link', { name: 'Treatment' }))

    expect(screen.getByText('Treatment: not implemented yet')).toBeInTheDocument()
  })

  it('shows the graph view with ?view=graph and keeps it in the tree links', () => {
    renderAt(`${project}/damage-scenarios/ds-01?view=graph`)

    expect(screen.getByText('Graph view: not implemented yet')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Damage scenario tabs' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /A-01/ })).toHaveAttribute('href', `${project}/assets/a-01?view=graph`)
  })

  it('routes the project settings sections', () => {
    renderAt(`${project}/settings/members`)

    expect(screen.getByText('Members: not implemented yet')).toBeInTheDocument()
  })

  it.each(['/does-not-exist', '/projects/unknown', `${project}/items/i-01/unknown-tab`, '/item-definition'])(
    'shows the not found page for %s',
    (path) => {
      renderAt(path)

      expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    },
  )
})
