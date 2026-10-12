import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('ItemDefinitionPage', () => {
  it('renders the headlamp example diagram', () => {
    render(
      <MemoryRouter initialEntries={['/item-definition']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /item definition/i })).toBeInTheDocument()
    expect(screen.getByText('Gateway ECU')).toBeInTheDocument()
    expect(screen.getByText('Body control ECU')).toBeInTheDocument()
    expect(screen.getByText('Item boundary: Headlamp system')).toBeInTheDocument()
  })

  it('redirects unknown routes to the item definition page', () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /item definition/i })).toBeInTheDocument()
  })
})
