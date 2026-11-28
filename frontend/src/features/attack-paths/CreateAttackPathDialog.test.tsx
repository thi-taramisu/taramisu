import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'
const TS01 = 'TS-1 Spoofed headlamp command on the CAN bus'

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const location = () => screen.getByTestId('location')

/** "Add Threat Scenario" once the threat scenarios are loaded; before, it is disabled and a click does nothing. */
async function addButton(dialog: HTMLElement) {
  const button = within(dialog).getByRole('button', { name: 'Add Threat Scenario' })
  await waitFor(() => expect(button).toBeEnabled())
  return button
}

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

    await user.click(await addButton(dialog))
    await user.click(await screen.findByRole('menuitem', { name: TS01 }))
    await user.type(within(dialog).getByLabelText(/Name/), 'Replay via the OBD port')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'Replay via the OBD port, Attack Path AP-4' })).toBeInTheDocument()
  })

  it('offers only threat scenarios that are in the tree, so the new attack path is shown there too', async () => {
    const { user } = renderApp(`${project}/items/i-01`)
    const dialog = await openDialog(user)

    await user.click(await addButton(dialog))

    expect(await screen.findByRole('menuitem', { name: TS01 })).toBeInTheDocument()
    // TS-2 and TS-3 lead to no damage scenario, so they are not in the tree.
    expect(screen.queryByRole('menuitem', { name: /TS-2|TS-3/ })).not.toBeInTheDocument()
    expect(within(dialog).getByText('2 threat scenarios are not in the tree yet and cannot be linked here.')).toBeInTheDocument()
  })

  it('does not start linked to a threat scenario of the page that is not in the tree', async () => {
    const { user } = renderApp(`${project}/threat-scenarios/ts-02`)
    const dialog = await openDialog(user)

    await within(dialog).findByText('2 threat scenarios are not in the tree yet and cannot be linked here.')
    expect(within(dialog).queryByRole('button', { name: /^Remove TS-2/ })).not.toBeInTheDocument()
  })

  it('requires a linked threat scenario', async () => {
    const { user, api } = renderApp(`${project}/items/i-01`)
    const dialog = await openDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Replay via the OBD port')
    // Before the threat scenarios are loaded, Create would say they are still loading.
    await addButton(dialog)
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

describe('create attack path from a Relations tab', () => {
  it('creates it linked to the threat scenario of the page', async () => {
    const { user, api } = renderApp(`${project}/threat-scenarios/ts-01/relations`)
    await user.click(within(await screen.findByRole('region', { name: 'Attack Paths' })).getByRole('button', { name: 'Add Attack Path' }))
    const picker = within(await screen.findByRole('dialog', { name: 'Add Attack Path' }))
    await user.type(picker.getByRole('textbox'), 'Replay via the OBD port')
    await user.click(picker.getByRole('button', { name: 'Create "Replay via the OBD port" as new Attack Path…' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'New Attack Path' }))
    expect(dialog.getByLabelText('Item')).toBeDisabled()
    expect(await dialog.findByRole('button', { name: `Remove ${TS01}` })).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'Replay via the OBD port, Attack Path AP-4' })).toBeInTheDocument()
    expect((await api.threatScenarios.relations('headlamp', 'ts-01')).attackPaths.map((ap) => ap.code)).toEqual(['AP-1', 'AP-2', 'AP-4'])
  })
})
