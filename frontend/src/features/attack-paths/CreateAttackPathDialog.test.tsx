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

  it('offers the unassigned threat scenarios of the item as well', async () => {
    const { user } = renderApp(`${project}/items/i-01`)
    const dialog = await openDialog(user)

    await user.click(await addButton(dialog))

    expect(await screen.findByRole('menuitem', { name: TS01 })).toBeInTheDocument()
    // TS-2 and TS-3 lead to no damage scenario, so they are in "Unassigned".
    expect(screen.getAllByRole('menuitem', { name: /TS-2|TS-3/ })).toHaveLength(2)
  })

  it('starts linked to an unassigned threat scenario of the page', async () => {
    const { user } = renderApp(`${project}/threat-scenarios/ts-02`)
    const dialog = await openDialog(user)

    expect(await within(dialog).findByRole('button', { name: /^Remove TS-2/ })).toBeInTheDocument()
    expect(within(dialog).getByText('Will appear in the tree below each linked threat scenario.')).toBeInTheDocument()
  })

  it('creates an attack path without links in "Unassigned" of the item', async () => {
    const { user, api } = renderApp(`${project}/items/i-01`)
    const dialog = await openDialog(user)
    await addButton(dialog)
    expect(within(dialog).getByText('Will appear in "Unassigned" of the item until it is linked.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/Name/), 'Replay via the OBD port')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: /^Replay via the OBD port, Attack Path/ })).toBeInTheDocument()
    const unassigned = within(await within(tree()).findByRole('list', { name: 'Attack Paths in Headlamp system' }))
    expect(unassigned.getByRole('link', { name: /Replay via the OBD port/ })).toHaveAttribute('aria-current', 'page')
    expect(await api.content.unassigned('headlamp', 'i-01')).toContainEqual(expect.objectContaining({ name: 'Replay via the OBD port' }))
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

