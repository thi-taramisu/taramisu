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

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /headlamp system \(example\)/i })).toHaveAttribute('href', project)
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

  it('shows the item definition diagram on the item route', async () => {
    renderAt(`${project}/items/i-01`)

    expect(screen.getByRole('heading', { name: 'I-01 Headlamp system' })).toBeInTheDocument()
    expect(await screen.findByText('Gateway ECU')).toBeInTheDocument()
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
