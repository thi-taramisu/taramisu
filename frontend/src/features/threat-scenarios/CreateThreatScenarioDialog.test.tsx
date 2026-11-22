import { screen, within } from '@testing-library/react'
import { ApiError } from '../../api/errors'
import { describe, expect, it } from 'vitest'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'
const DS01 = 'DS-1 Headlamp turns off while driving at night'

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const location = () => screen.getByTestId('location')

async function openDialog(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await within(tree()).findByRole('button', { name: 'New' }))
  await user.click(screen.getByRole('menuitem', { name: 'Threat Scenario' }))
  return screen.getByRole('dialog', { name: 'New Threat Scenario' })
}

describe('create threat scenario', () => {
  it('loads the damage scenarios of the item only once the dialog is opened', async () => {
    const api = createMockItemApi()
    const damageScenarios = api.content.damageScenarios
    let calls = 0
    api.content.damageScenarios = (...args) => {
      calls += 1
      return damageScenarios(...args)
    }
    const { user } = renderApp(`${project}/items/i-01`, api)
    await within(tree()).findByRole('button', { name: 'New' })
    expect(calls).toBe(0)

    const dialog = await openDialog(user)

    await within(dialog).findByRole('button', { name: 'Add Damage Scenario' })
    expect(calls).toBe(1)
  })

  it('starts with the item and damage scenario of the current page and creates the threat scenario below it', async () => {
    const { user, api } = renderApp(`${project}/damage-scenarios/ds-01`)
    const dialog = await openDialog(user)

    expect(within(dialog).getByLabelText('Item')).toHaveDisplayValue('Headlamp system')
    expect(await within(dialog).findByRole('button', { name: `Remove ${DS01}` })).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/Name/), 'Forged dimming command')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'Forged dimming command, Threat Scenario TS-4' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(tree()).getByRole('link', { name: 'TS-4 Forged dimming command' })).toHaveAttribute('aria-current', 'page')
    const id = location().textContent!.split('/').at(-1)!
    expect((await api.threatScenarios.relations('headlamp', id)).damageScenarios.map((ds) => ds.code)).toEqual(['DS-1'])
  })

  it('links a damage scenario of the item from "Add Damage Scenario"', async () => {
    const { user } = renderApp(`${project}/items/i-01`)
    const dialog = await openDialog(user)
    expect(within(dialog).queryByRole('button', { name: `Remove ${DS01}` })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Add Damage Scenario' }))
    await user.click(await screen.findByRole('menuitem', { name: DS01 }))
    await user.type(within(dialog).getByLabelText(/Name/), 'Forged dimming command')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'Forged dimming command, Threat Scenario TS-4' })).toBeInTheDocument()
  })

  it('requires a name and a linked damage scenario', async () => {
    const { user, api } = renderApp(`${project}/damage-scenarios/ds-01`)
    const dialog = await openDialog(user)

    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))
    expect(within(dialog).getByLabelText(/Name/)).toHaveAccessibleDescription('Name is required.')

    await user.type(within(dialog).getByLabelText(/Name/), 'Forged dimming command')
    await user.click(await within(dialog).findByRole('button', { name: `Remove ${DS01}` }))
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Link at least one damage scenario.')
    expect(await api.content.threatScenarios('headlamp', 'i-01')).toHaveLength(3)
  })

  it('drops the linked damage scenarios when another item is chosen', async () => {
    const api = createMockItemApi()
    await api.items.create('headlamp', { name: 'Rear lights', scope_type: 'ITEM' })
    const { user } = renderApp(`${project}/damage-scenarios/ds-01`, api)
    const dialog = await openDialog(user)
    await within(dialog).findByRole('button', { name: `Remove ${DS01}` })

    await user.selectOptions(within(dialog).getByLabelText('Item'), 'Rear lights')

    expect(within(dialog).queryByRole('button', { name: `Remove ${DS01}` })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add Damage Scenario' })).toBeDisabled()
  })

  it('keeps the dialog open with the link after "Create & add another"', async () => {
    const { user } = renderApp(`${project}/damage-scenarios/ds-01`)
    const dialog = await openDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Forged dimming command')
    await user.click(within(dialog).getByRole('button', { name: 'Create & add another' }))

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Forged dimming command created.')
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: `Remove ${DS01}` })).toBeInTheDocument()
    expect(location()).toHaveTextContent(`${project}/damage-scenarios/ds-01`)
  })

  it('says so when the damage scenarios of the item cannot be loaded', async () => {
    const api = createMockItemApi()
    api.content.damageScenarios = () => Promise.reject(new ApiError(500, 'Server error'))
    const { user } = renderApp(`${project}/damage-scenarios/ds-01`, api)
    const dialog = await openDialog(user)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The damage scenarios of this item could not be loaded.')
    await user.type(within(dialog).getByLabelText(/Name/), 'Forged dimming command')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('The damage scenarios of this item could not be loaded.')
    expect(await api.content.threatScenarios('headlamp', 'i-01')).toHaveLength(3)
  })

  it('asks for an item first in a project without items', async () => {
    const api = createMockItemApi()
    await api.items.delete('headlamp', 'i-01')
    const { user } = renderApp(project, api)
    const dialog = await openDialog(user)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Create an item first; damage scenarios belong to an item.')
  })

  it('shows an error and keeps the dialog open when creating fails', async () => {
    const api = createMockItemApi()
    api.threatScenarios.create = () => Promise.reject(new Error('network'))
    const { user } = renderApp(`${project}/damage-scenarios/ds-01`, api)
    const dialog = await openDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Forged dimming command')
    await within(dialog).findByRole('button', { name: `Remove ${DS01}` })
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The threat scenario could not be created. Please try again.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

async function createFromRelations(user: ReturnType<typeof renderApp>['user'], name: string) {
  await user.click(within(await screen.findByRole('region', { name: 'Threat Scenarios' })).getByRole('button', { name: 'Add Threat Scenario' }))
  const picker = within(await screen.findByRole('dialog', { name: 'Add Threat Scenario' }))
  await user.type(picker.getByRole('textbox'), name)
  await user.click(picker.getByRole('button', { name: `Create "${name}" as new Threat Scenario…` }))
  return within(await screen.findByRole('dialog', { name: 'New Threat Scenario' }))
}

describe('create threat scenario from a Relations tab', () => {
  it('creates it linked to the damage scenario of the page', async () => {
    const { user, api } = renderApp(`${project}/damage-scenarios/ds-01/relations`)
    const dialog = await createFromRelations(user, 'Forged dimming command')

    expect(dialog.getByLabelText(/Name/)).toHaveDisplayValue('Forged dimming command')
    // Links only work within the item of the damage scenario.
    expect(dialog.getByLabelText('Item')).toBeDisabled()
    expect(await dialog.findByRole('button', { name: `Remove ${DS01}` })).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'Forged dimming command, Threat Scenario TS-4' })).toBeInTheDocument()
    expect((await api.damageScenarios.relations('headlamp', 'ds-01')).threatScenarios.map((ts) => ts.code)).toEqual(['TS-1', 'TS-4'])
  })

  it('links it to the attack path of the page after creating, and only links on retry when that fails', async () => {
    const api = createMockItemApi()
    const linkThreatScenario = api.attackPaths.linkThreatScenario
    api.attackPaths.linkThreatScenario = () => Promise.reject(new ApiError(500, 'Server error'))
    const { user } = renderApp(`${project}/attack-paths/ap-01/relations`, api)
    const dialog = await createFromRelations(user, 'Forged dimming command')
    await user.click(dialog.getByRole('button', { name: 'Add Damage Scenario' }))
    await user.click(await screen.findByRole('menuitem', { name: DS01 }))

    await user.click(dialog.getByRole('button', { name: 'Create & open' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('TS-4 was created, but it could not be linked.')

    api.attackPaths.linkThreatScenario = linkThreatScenario
    await user.click(dialog.getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'Forged dimming command, Threat Scenario TS-4' })).toBeInTheDocument()
    expect((await api.attackPaths.relations('headlamp', 'ap-01')).threatScenarios.map((ts) => ts.code)).toEqual(['TS-1', 'TS-4'])
    expect(await api.content.threatScenarios('headlamp', 'i-01')).toHaveLength(4)
  })
})
