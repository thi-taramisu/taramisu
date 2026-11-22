import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'

describe('element header', () => {
  it('shows the ID of tree elements in the same place and format, and updates it on switching', async () => {
    const { user } = renderApp(`${project}/assets/a-01`)

    await screen.findByRole('heading', { name: 'Headlamp on/off command, Asset AS-1' })
    expect(screen.getByText('Asset AS-1')).toBeInTheDocument()

    const tree = screen.getByRole('navigation', { name: 'Project elements' })
    await user.click(within(tree).getByRole('link', { name: 'AS-2 Body control ECU firmware' }))
    await screen.findByRole('heading', { name: 'Body control ECU firmware, Asset AS-2' })
    expect(screen.getByText('Asset AS-2')).toBeInTheDocument()
    expect(screen.queryByText('Asset AS-1')).not.toBeInTheDocument()

    await user.click(within(tree).getByRole('link', { name: 'TS-1 Spoofed headlamp command on the CAN bus' }))
    await screen.findByRole('heading', { name: 'Spoofed headlamp command on the CAN bus, Threat Scenario TS-1' })
    expect(screen.getByText('Threat Scenario TS-1')).toBeInTheDocument()
    expect(screen.queryByText('Asset AS-2')).not.toBeInTheDocument()
  })

  it('shows no ID for items, which have none', async () => {
    renderApp(`${project}/items/i-01`)

    await screen.findByRole('heading', { name: 'Headlamp system' })
    expect(screen.getByText('Item')).toBeInTheDocument()
    expect(screen.queryByText(/^Item #/)).not.toBeInTheDocument()
  })
})
