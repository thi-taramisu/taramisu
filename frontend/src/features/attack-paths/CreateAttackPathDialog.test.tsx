import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'
const TS01 = 'TS-1 Spoofed headlamp command on the CAN bus'

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const location = () => screen.getByTestId('location')

async function openDialog(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await within(tree()).findByRole('button', { name: 'New' }))
  await user.click(screen.getByRole('menuitem', { name: 'Attack Path' }))
  return screen.getByRole('dialog', { name: 'New Attack Path' })
}

describe('create attack path', () => {
  it('starts with the item and threat scenario of the current page and creates the attack path below it', async () => {
    const { user, api } = renderApp(`${project}/threat-scenarios/ts-01`)
    const dialog = await openDialog(user)

    expect(within(dialog).getByLabelText('Item')).toHaveDisplayValue('Headlamp system')
    expect(await within(dialog).findByRole('button', { name: `Remove ${TS01}` })).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/Name/), 'Replay via the OBD port')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'Replay via the OBD port, Attack Path AP-4' })).toBeInTheDocument()
    expect(within(tree()).getByRole('link', { name: 'AP-4 Replay via the OBD port' })).toHaveAttribute('aria-current', 'page')
    const id = location().textContent!.split('/').at(-1)!
    expect((await api.attackPaths.relations('headlamp', id)).threatScenarios.map((ts) => ts.code)).toEqual(['TS-1'])
  })

  it('links a threat scenario of the item from "Add Threat Scenario"', async () => {
    const { user } = renderApp(`${project}/items/i-01`)
    const dialog = await openDialog(user)

    await user.click(within(dialog).getByRole('button', { name: 'Add Threat Scenario' }))
    await user.click(await screen.findByRole('menuitem', { name: TS01 }))
    await user.type(within(dialog).getByLabelText(/Name/), 'Replay via the OBD port')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'Replay via the OBD port, Attack Path AP-4' })).toBeInTheDocument()
  })

  it('requires a linked threat scenario', async () => {
    const { user, api } = renderApp(`${project}/items/i-01`)
    const dialog = await openDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Replay via the OBD port')
    await within(dialog).findByRole('button', { name: 'Add Threat Scenario' })
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Link at least one threat scenario.')
    expect(await api.content.attackPaths('headlamp', 'i-01')).toHaveLength(3)
  })

  it('shows an error and keeps the dialog open when creating fails', async () => {
    const api = createMockItemApi()
    api.attackPaths.create = () => Promise.reject(new Error('network'))
    const { user } = renderApp(`${project}/threat-scenarios/ts-01`, api)
    const dialog = await openDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Replay via the OBD port')
    await within(dialog).findByRole('button', { name: `Remove ${TS01}` })
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The attack path could not be created. Please try again.')
  })
})
