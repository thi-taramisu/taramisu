import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/errors'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'
const page = `${project}/damage-scenarios/ds-01/relations`
const TS01 = 'TS-01 Spoofed headlamp command on the CAN bus'
const A01 = 'A-01 Headlamp on/off command'

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const section = (name: string) => within(screen.getByRole('region', { name }))
const findSection = async (name: string) => within(await screen.findByRole('region', { name }))

async function add(user: ReturnType<typeof renderApp>['user'], sectionName: string, button: string, option: RegExp) {
  await user.click((await findSection(sectionName)).getByRole('button', { name: button }))
  await user.click(within(await screen.findByRole('dialog', { name: button })).getByRole('button', { name: option }))
}

async function remove(user: ReturnType<typeof renderApp>['user'], sectionName: string, name: string) {
  await user.click((await findSection(sectionName)).getByRole('button', { name: `Remove link to ${name}` }))
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove link' }))
}

describe('damage scenario relations', () => {
  it('lists the linked assets with their properties and the threat scenarios', async () => {
    renderApp(page)

    const assets = await findSection('Assets')
    expect(assets.getByRole('link', { name: 'Headlamp on/off command' })).toHaveAttribute('href', `${project}/assets/a-01`)
    const properties = assets.getByRole('group', { name: 'A-01 properties' })
    expect(within(properties).getAllByRole('button', { pressed: true }).map((button) => button.textContent)).toEqual(['I', 'A'])
    // The asset has no C, so it is shown as not available instead of being a toggle.
    expect(within(properties).queryByRole('button', { name: 'A-01 Confidentiality' })).not.toBeInTheDocument()
    expect(within(properties).getByText('Confidentiality: not a property of this asset')).toBeInTheDocument()
    expect(section('Threat Scenarios').getByRole('link', { name: 'Spoofed headlamp command on the CAN bus' })).toHaveAttribute(
      'href',
      `${project}/threat-scenarios/ts-01`,
    )
  })

  it('shows whether the linked elements are above or below in the hierarchy', async () => {
    renderApp(page)

    expect((await findSection('Assets')).getByTitle('Above in the hierarchy')).toBeInTheDocument()
    expect(section('Threat Scenarios').getByTitle('Below in the hierarchy')).toBeInTheDocument()
  })

  it('adds further threat scenarios and shows them in the tree and tab count', async () => {
    const { user, api } = renderApp(page)

    await add(user, 'Threat Scenarios', 'Add Threat Scenario', /TS-02 Replayed headlamp command/)

    expect(await section('Threat Scenarios').findByRole('link', { name: 'Replayed headlamp command on the CAN bus' })).toBeInTheDocument()
    expect(await within(tree()).findByRole('link', { name: /TS-02 Replayed headlamp command/ })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Relations (3)' })).toBeInTheDocument()
    expect((await api.damageScenarios.relations('headlamp', 'ds-01')).threatScenarios.map((t) => t.code)).toEqual(['TS-01', 'TS-02'])
  })

  it('offers only threat scenarios that are not linked yet', async () => {
    const { user } = renderApp(page)

    await user.click((await findSection('Threat Scenarios')).getByRole('button', { name: 'Add Threat Scenario' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'Add Threat Scenario' }))
    expect(dialog.queryByRole('button', { name: /TS-01/ })).not.toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /TS-02/ })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /TS-03/ })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Create new Threat Scenario…' })).toBeDisabled()
  })

  it('links one threat scenario to several damage scenarios', async () => {
    const api = createMockItemApi()
    const second = await api.damageScenarios.create('headlamp', {
      item_definition_id: 'i-01',
      title: 'Glare for oncoming traffic',
      asset_properties: [{ asset_id: 'a-03', property: 'I' }],
    })
    const { user } = renderApp(`${project}/damage-scenarios/${second.id}/relations`, api)

    await add(user, 'Threat Scenarios', 'Add Threat Scenario', /TS-01 Spoofed/)

    await waitFor(() => expect(within(tree()).getAllByRole('link', { name: new RegExp(TS01) })).toHaveLength(2))
    // The attack paths of the threat scenario come along.
    expect(within(tree()).getAllByRole('link', { name: /AP-01/ })).toHaveLength(2)
  })

  it('removes a threat scenario link after confirmation and keeps the threat scenario available', async () => {
    const { user, api } = renderApp(page)

    await user.click((await findSection('Threat Scenarios')).getByRole('button', { name: `Remove link to ${TS01}` }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect(section('Threat Scenarios').getByRole('link', { name: 'Spoofed headlamp command on the CAN bus' })).toBeInTheDocument()

    await remove(user, 'Threat Scenarios', TS01)

    expect(await section('Threat Scenarios').findByText('No threat scenarios linked yet.')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Relations (1)' })).toBeInTheDocument()
    expect(await api.content.threatScenarios('headlamp', 'i-01')).toContainEqual(expect.objectContaining({ code: 'TS-01' }))
  })

  it('adds an asset with all its properties and offers only assets with properties', async () => {
    const api = createMockItemApi()
    await api.content.addAsset('headlamp', 'i-01', { name: 'Unrated asset', component: 'ECU', properties: [] })
    const { user } = renderApp(page, api)

    await user.click((await findSection('Assets')).getByRole('button', { name: 'Add Asset' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add Asset' }))
    expect(dialog.queryByRole('button', { name: /Unrated asset/ })).not.toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: /A-04 Diagnostic session key/ }))

    const properties = await section('Assets').findByRole('group', { name: 'A-04 properties' })
    expect(within(properties).getAllByRole('button', { pressed: true }).map((button) => button.textContent)).toEqual(['C', 'I'])
    await waitFor(async () => expect((await api.content.assets('headlamp', 'i-01')).find((a) => a.id === 'a-04')).toMatchObject({ damageScenarios: 1, threatScenarios: 1 }))
  })

  it('shows the properties of each asset in the add dialog and links all of them', async () => {
    const { user, api } = renderApp(page)

    await user.click((await findSection('Assets')).getByRole('button', { name: 'Add Asset' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add Asset' }))
    await user.click(dialog.getByRole('button', { name: 'A-04 Diagnostic session key Properties C, I' }))

    await section('Assets').findByRole('group', { name: 'A-04 properties' })
    expect((await api.damageScenarios.relations('headlamp', 'ds-01')).assets.find((a) => a.id === 'a-04')).toMatchObject({ linkedProperties: ['C', 'I'] })
  })

  it('filters the elements to link by name and ID and starts a new search on every opening', async () => {
    const { user } = renderApp(page)
    const openDialog = async () => {
      await user.click((await findSection('Threat Scenarios')).getByRole('button', { name: 'Add Threat Scenario' }))
      return within(await screen.findByRole('dialog', { name: 'Add Threat Scenario' }))
    }
    const dialog = await openDialog()
    const search = dialog.getByRole('textbox', { name: 'Search by name, ID, or type a new name' })

    await user.type(search, 'denial')
    expect(dialog.queryByRole('button', { name: /TS-02/ })).not.toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /TS-03/ })).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'ts-02')
    expect(dialog.getByRole('button', { name: /TS-02/ })).toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: /TS-03/ })).not.toBeInTheDocument()
    await user.type(search, 'x')
    expect(dialog.getByText('No threat scenarios match "ts-02x".')).toBeInTheDocument()

    await user.click(dialog.getByRole('button', { name: 'Close' }))
    expect((await openDialog()).getByRole('textbox', { name: 'Search by name, ID, or type a new name' })).toHaveValue('')
  })

  it('changes the properties of a link but keeps the last one', async () => {
    const { user, api } = renderApp(page)
    const assets = await findSection('Assets')

    await user.click(assets.getByRole('button', { name: 'A-01 Availability' }))

    await waitFor(() => expect(assets.getByRole('button', { name: 'A-01 Availability' })).toHaveAttribute('aria-pressed', 'false'))
    expect((await api.damageScenarios.relations('headlamp', 'ds-01')).assets[0].linkedProperties).toEqual(['I'])
    const integrity = assets.getByRole('button', { name: 'A-01 Integrity' })
    await waitFor(() => expect(integrity).toHaveAttribute('aria-disabled', 'true'))
    await user.click(integrity)
    expect(integrity).toHaveAttribute('aria-pressed', 'true')
    expect((await api.damageScenarios.relations('headlamp', 'ds-01')).assets[0].linkedProperties).toEqual(['I'])
  })

  it('removes the last asset link, keeps the page open and takes the damage scenario out of the tree', async () => {
    const { user, api } = renderApp(page)

    await remove(user, 'Assets', A01)

    expect(await section('Assets').findByText('No assets linked yet.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'DS-01 Headlamp turns off while driving at night' })).toBeInTheDocument()
    await waitFor(() => expect(within(tree()).queryByRole('link', { name: /DS-01/ })).not.toBeInTheDocument())
    expect(await api.damageScenarios.get('headlamp', 'ds-01')).toMatchObject({ code: 'DS-01' })
  })

  it('shows an error and keeps the links when saving fails', async () => {
    const api = createMockItemApi()
    api.damageScenarios.linkThreatScenario = () => Promise.reject(new ApiError(500, 'Server error'))
    const { user } = renderApp(page, api)

    await add(user, 'Threat Scenarios', 'Add Threat Scenario', /TS-03/)

    expect(await section('Threat Scenarios').findByRole('alert')).toHaveTextContent('The link could not be changed')
    expect(section('Threat Scenarios').getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows an error when the relations cannot be loaded', async () => {
    const api = createMockItemApi()
    api.damageScenarios.relations = () => Promise.reject(new ApiError(500, 'Server error'))
    renderApp(page, api)

    expect(await screen.findByText('The relations could not be loaded.')).toBeInTheDocument()
  })

  it('shows a loading state until the relations arrive', async () => {
    const api = createMockItemApi()
    api.damageScenarios.relations = () => new Promise(() => undefined)
    renderApp(page, api)

    expect(await screen.findByText('Loading relations…')).toBeInTheDocument()
  })

  it('keeps the links and shows an error when refreshing them fails', async () => {
    const api = createMockItemApi()
    const { user } = renderApp(page, api)
    await findSection('Threat Scenarios')
    api.damageScenarios.relations = () => Promise.reject(new ApiError(500, 'Server error'))

    await add(user, 'Threat Scenarios', 'Add Threat Scenario', /TS-03/)

    expect(await screen.findByText('The relations could not be refreshed.')).toBeInTheDocument()
    expect(section('Threat Scenarios').getByRole('link', { name: 'Spoofed headlamp command on the CAN bus' })).toBeInTheDocument()
  })

  it('shows an error in the add dialog when the elements to link cannot be loaded', async () => {
    const api = createMockItemApi()
    api.content.assets = () => Promise.reject(new ApiError(500, 'Server error'))
    api.content.threatScenarios = () => Promise.reject(new ApiError(500, 'Server error'))
    const { user } = renderApp(page, api)

    await user.click((await findSection('Assets')).getByRole('button', { name: 'Add Asset' }))
    const assets = within(await screen.findByRole('dialog', { name: 'Add Asset' }))
    expect(await assets.findByRole('alert')).toHaveTextContent('The assets of this item could not be loaded.')
    expect(assets.queryByText('No assets left to link.')).not.toBeInTheDocument()
    await user.click(assets.getByRole('button', { name: 'Close' }))

    await user.click(section('Threat Scenarios').getByRole('button', { name: 'Add Threat Scenario' }))
    const threats = within(await screen.findByRole('dialog', { name: 'Add Threat Scenario' }))
    expect(await threats.findByRole('alert')).toHaveTextContent('The threat scenarios of this item could not be loaded.')
  })

  it('shows a loading state in the add dialog until the elements to link arrive', async () => {
    const api = createMockItemApi()
    api.content.threatScenarios = () => new Promise(() => undefined)
    const { user } = renderApp(page, api)

    await user.click((await findSection('Threat Scenarios')).getByRole('button', { name: 'Add Threat Scenario' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'Add Threat Scenario' }))
    expect(dialog.getByText('Loading…')).toBeInTheDocument()
    expect(dialog.queryByText('No threat scenarios left to link.')).not.toBeInTheDocument()
  })

  it('keeps the focus and ignores further changes while saving', async () => {
    const api = createMockItemApi()
    const { linkAsset } = api.damageScenarios
    const saved = vi.fn<() => void>()
    let finish!: () => void
    api.damageScenarios.linkAsset = (...args) => {
      saved()
      return new Promise((resolve) => {
        finish = () => resolve(linkAsset(...args))
      })
    }
    const { user } = renderApp(page, api)
    const assets = await findSection('Assets')
    const availability = assets.getByRole('button', { name: 'A-01 Availability' })

    await user.click(availability)
    await waitFor(() => expect(availability).toHaveAttribute('aria-disabled', 'true'))

    expect(availability).toHaveFocus()
    await user.click(assets.getByRole('button', { name: 'A-01 Integrity' }))
    await user.click(assets.getByRole('button', { name: 'Add Asset' }))
    expect(saved).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    act(() => finish())
    await waitFor(() => expect(availability).toHaveAttribute('aria-pressed', 'false'))
  })
})
