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
  await user.click(await screen.findByRole('menuitem', { name: option }))
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
    expect(section('Threat Scenarios').getByRole('link', { name: 'Spoofed headlamp command on the CAN bus' })).toHaveAttribute(
      'href',
      `${project}/threat-scenarios/ts-01`,
    )
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

    const options = (await screen.findAllByRole('menuitem')).map((option) => option.textContent)
    expect(options).toEqual(['TS-02 Replayed headlamp command on the CAN bus', 'TS-03 Denial of service on the body control ECU'])
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
    expect(screen.queryByRole('menuitem', { name: /Unrated asset/ })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('menuitem', { name: /A-04 Diagnostic session key/ }))

    const properties = await section('Assets').findByRole('group', { name: 'A-04 properties' })
    expect(within(properties).getAllByRole('button', { pressed: true }).map((button) => button.textContent)).toEqual(['C', 'I'])
    await waitFor(async () => expect((await api.content.assets('headlamp', 'i-01')).find((a) => a.id === 'a-04')).toMatchObject({ damageScenarios: 1, threatScenarios: 1 }))
  })

  it('changes the properties of a link but keeps the last one', async () => {
    const { user, api } = renderApp(page)
    const assets = await findSection('Assets')

    await user.click(assets.getByRole('button', { name: 'A-01 Availability' }))

    await waitFor(() => expect(assets.getByRole('button', { name: 'A-01 Availability' })).toHaveAttribute('aria-pressed', 'false'))
    expect((await api.damageScenarios.relations('headlamp', 'ds-01')).assets[0].linkedProperties).toEqual(['I'])
    await waitFor(() => expect(assets.getByRole('button', { name: 'A-01 Integrity' })).toBeDisabled())
  })

  it('keeps the last asset link and allows removing it once another asset is linked', async () => {
    const { user } = renderApp(page)
    const assets = await findSection('Assets')
    expect(assets.getByRole('button', { name: `Remove link to ${A01}` })).toBeDisabled()

    await add(user, 'Assets', 'Add Asset', /A-02 Body control ECU firmware/)
    await assets.findByRole('group', { name: 'A-02 properties' })
    await waitFor(() => expect(assets.getByRole('button', { name: `Remove link to ${A01}` })).toBeEnabled())

    await remove(user, 'Assets', A01)

    await waitFor(() => expect(assets.queryByRole('group', { name: 'A-01 properties' })).not.toBeInTheDocument())
    expect(await within(tree()).findByRole('link', { name: /DS-01/ })).toBeInTheDocument()
  })

  it('shows an error and keeps the links when saving fails', async () => {
    const api = createMockItemApi()
    api.damageScenarios.linkThreatScenario = () => Promise.reject(new ApiError(500, 'Server error'))
    const { user } = renderApp(page, api)

    await add(user, 'Threat Scenarios', 'Add Threat Scenario', /TS-03/)

    expect(await section('Threat Scenarios').findByRole('alert')).toHaveTextContent('The link could not be saved')
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

  it('shows an error when the elements to link cannot be loaded', async () => {
    const api = createMockItemApi()
    api.content.assets = () => Promise.reject(new ApiError(500, 'Server error'))
    api.content.threatScenarios = () => Promise.reject(new ApiError(500, 'Server error'))
    renderApp(page, api)

    expect(await (await findSection('Assets')).findByRole('alert')).toHaveTextContent('The assets of the item could not be loaded.')
    expect(await section('Threat Scenarios').findByRole('alert')).toHaveTextContent('The threat scenarios of the item could not be loaded.')
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
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()

    act(() => finish())
    await waitFor(() => expect(availability).toHaveAttribute('aria-pressed', 'false'))
  })
})
