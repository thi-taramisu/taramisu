import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('colour scheme pages', () => {
  it('compares all schemes and navigates to a shareable individual page', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/design-system/colors']}><App /></MemoryRouter>)
    expect(screen.getAllByRole('region')).toHaveLength(6)
    const navigation = screen.getByRole('navigation', { name: 'Colour schemes' })
    const ocean = within(navigation).getByRole('link', { name: 'Ocean' })
    expect(ocean).toHaveAttribute('href', '/design-system/colors/ocean')
    await user.click(ocean)
    expect(screen.getByRole('heading', { name: 'Ocean colour scheme' })).toBeInTheDocument()
    expect(screen.getAllByRole('region')).toHaveLength(2)
    expect(ocean).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByText('Risk 5')).toHaveLength(2)
    await user.click(within(navigation).getByRole('link', { name: 'Compare all' }))
    expect(screen.getAllByRole('region')).toHaveLength(6)
  })
})
