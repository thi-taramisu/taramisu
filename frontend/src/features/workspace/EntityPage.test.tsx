import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'

describe('element header', () => {
  it('shows the ID of tree elements in the same place and format, and updates it on switching', async () => {
    const { user } = renderApp(`${project}/assets/a-01`)

    await screen.findByRole('heading', { name: 'Headlamp on/off command, Asset #01' })
    expect(screen.getByText('Asset #01')).toBeInTheDocument()

    const tree = screen.getByRole('navigation', { name: 'Project elements' })
    await user.click(within(tree).getByRole('link', { name: 'A-02 Body control ECU firmware' }))
    await screen.findByRole('heading', { name: 'Body control ECU firmware, Asset #02' })
    expect(screen.getByText('Asset #02')).toBeInTheDocument()
    expect(screen.queryByText('Asset #01')).not.toBeInTheDocument()

    await user.click(within(tree).getByRole('link', { name: 'TS-01 Spoofed headlamp command on the CAN bus' }))
    await screen.findByRole('heading', { name: 'Spoofed headlamp command on the CAN bus, Threat scenario #01' })
    expect(screen.getByText('Threat scenario #01')).toBeInTheDocument()
    expect(screen.queryByText('Asset #02')).not.toBeInTheDocument()
  })

  it('shows no ID for items, which have none', async () => {
    renderApp(`${project}/items/i-01`)

    await screen.findByRole('heading', { name: 'Headlamp system' })
    expect(screen.getByText('Item')).toBeInTheDocument()
    expect(screen.queryByText(/^Item #/)).not.toBeInTheDocument()
  })
})
