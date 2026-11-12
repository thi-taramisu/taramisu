import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/errors'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'
const page = `${project}/assets/a-01`

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const section = (name: string) => within(screen.getByRole('region', { name }))
const findSection = async (name: string) => within(await screen.findByRole('region', { name }))
const fail = () => Promise.reject(new ApiError(500, 'Server error'))

/** A second damage scenario of the item, linked to A-03 only, so A-01 can link it. */
async function apiWithSecondScenario() {
  const api = createMockItemApi()
  const second = await api.damageScenarios.create('headlamp', {
    item_definition_id: 'i-01',
    title: 'Glare for oncoming traffic',
    asset_properties: [{ asset_id: 'a-03', property: 'I' }],
  })
  return { api, second }
}

describe('asset page', () => {
  it('shows the tabs of the wireframe with Definition as default and the number of relations', async () => {
    renderApp(page)

    expect(await screen.findByRole('heading', { name: 'A-01 Headlamp on/off command' })).toBeInTheDocument()
    const tabs = within(screen.getByRole('navigation', { name: 'Asset tabs' }))
    expect(tabs.getByRole('link', { name: 'Definition' })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('link', { name: 'Risks' })).toHaveAttribute('href', `${page}/risks`)
    // DS-01 and TS-01, which reaches the asset through DS-01.
    expect(await tabs.findByRole('link', { name: 'Relations 2' })).toHaveAttribute('href', `${page}/relations`)
  })

  it('shows a not-found state for unknown assets', async () => {
    renderApp(`${project}/assets/nope`)

    expect(await screen.findByRole('heading', { name: 'Asset not found' })).toBeInTheDocument()
  })

  it('shows an error when the asset cannot be loaded', async () => {
    const api = createMockItemApi()
    api.assets.get = fail
    renderApp(page, api)

    expect(await screen.findByText('The asset could not be loaded.')).toBeInTheDocument()
  })
})

describe('asset definition', () => {
  it('shows the fields of the data model and the declared properties with their use', async () => {
    renderApp(page)

    expect(await screen.findByLabelText(/Name/)).toHaveDisplayValue('Headlamp on/off command')
    expect(screen.getByLabelText('Identification Source')).toHaveDisplayValue('Item Definition')
    expect(screen.getByLabelText('Description')).toHaveDisplayValue('CAN message from the body control ECU that switches the low beam on and off.')

    const properties = within(screen.getByRole('group', { name: 'Cybersecurity Properties' }))
    expect(properties.getByRole('checkbox', { name: /Confidentiality/ })).not.toBeChecked()
    expect(properties.getByRole('checkbox', { name: /Integrity/ })).toBeChecked()
    expect(properties.getByRole('checkbox', { name: /Integrity/ })).toHaveAccessibleDescription(/Leads to DS-01 · targeted by TS-01/)
    expect(properties.getByRole('checkbox', { name: /Availability/ })).toHaveAccessibleDescription(/Leads to DS-01\./)
    expect(properties.getByLabelText('Integrity description')).toHaveDisplayValue('A forged command switches the headlamp off.')
    expect(properties.queryByLabelText('Confidentiality description')).not.toBeInTheDocument()
  })

  it('edits and saves the fields and properties and renames the asset in the tree', async () => {
    const { user, api } = renderApp(page)
    const name = await screen.findByLabelText(/Name/)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.clear(name)
    await user.type(name, 'Low beam command')
    await user.selectOptions(screen.getByLabelText('Identification Source'), 'Catalogue')
    await user.click(screen.getByRole('checkbox', { name: /Confidentiality/ }))
    await user.type(screen.getByLabelText('Confidentiality description'), 'Reveals when the driver is on the road.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(await within(tree()).findByRole('link', { name: /A-01 Low beam command/ })).toBeInTheDocument()
    expect(await api.assets.get('headlamp', 'a-01')).toMatchObject({
      name: 'Low beam command',
      identification_source: 'CATALOGUE',
      properties: [
        { property: 'C', description: 'Reveals when the driver is on the road.' },
        { property: 'I', description: 'A forged command switches the headlamp off.' },
        { property: 'A', description: 'A suppressed command leaves the headlamp off.' },
      ],
    })
    // The asset table of the item shows the new property too.
    expect((await api.content.assets('headlamp', 'i-01'))[0].properties).toEqual(['C', 'I', 'A'])
  })

  it('offers no empty identification source once a source is chosen', async () => {
    renderApp(page)

    const source = await screen.findByLabelText('Identification Source')
    expect(within(source).queryByRole('option', { name: 'Select…' })).not.toBeInTheDocument()
  })

  it('shows the identification source placeholder while no source is chosen and drops it after choosing one', async () => {
    const api = createMockItemApi()
    await api.assets.update('headlamp', 'a-03', { identification_source: null })
    const { user } = renderApp(`${project}/assets/a-03`, api)

    const source = await screen.findByLabelText('Identification Source')
    expect(source).toHaveDisplayValue('Select…')
    expect(within(source).getByRole('option', { name: 'Select…' })).toBeDisabled()

    await user.selectOptions(source, 'Catalogue')

    expect(within(source).queryByRole('option', { name: 'Select…' })).not.toBeInTheDocument()
  })

  it('requires a name', async () => {
    const { user } = renderApp(page)

    await user.clear(await screen.findByLabelText(/Name/))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Name is required.')
    expect(screen.getByLabelText(/Name/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('removes an unused property', async () => {
    const { user, api } = renderApp(`${project}/assets/a-02`)

    await user.click(await screen.findByRole('checkbox', { name: /Integrity/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect((await api.assets.get('headlamp', 'a-02')).properties).toEqual([])
  })

  it('keeps a property that leads to a damage scenario', async () => {
    const { user } = renderApp(page)
    const integrity = await screen.findByRole('checkbox', { name: /Integrity/ })

    await user.click(integrity)

    expect(integrity).toBeChecked()
    expect(integrity).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getAllByRole('link', { name: 'Remove the links on the Relations tab' })[0]).toHaveAttribute('href', `${page}/relations`)
  })

  it('shows an error when saving fails', async () => {
    const api = createMockItemApi()
    api.assets.update = fail
    const { user } = renderApp(page, api)

    await user.type(await screen.findByLabelText('Description'), '!')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The asset could not be saved. Please try again.')
  })
})

describe('asset risks', () => {
  it('shows each damage × threat scenario of the asset with the calculated risk', async () => {
    renderApp(`${page}/risks`)

    const table = await screen.findByRole('table')
    const [, row] = within(table).getAllByRole('row')
    expect(within(row).getByLabelText('Properties I, A')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: /DS-01 Headlamp turns off/ })).toHaveAttribute('href', `${project}/damage-scenarios/ds-01/impact`)
    expect(within(row).getByRole('link', { name: /TS-01 Spoofed headlamp command/ })).toHaveAttribute('href', `${project}/threat-scenarios/ts-01/risks`)
    expect(within(row).getByText('targeted')).toBeInTheDocument()
    // AP-02 (Medium) is the most feasible path; Severe safety impact × Medium → 4, as on the threat scenario's Risks tab.
    expect(await within(row).findByText('Medium')).toBeInTheDocument()
    expect(within(row).getByText('via AP-02')).toBeInTheDocument()
    expect(within(row).getByText('Risk 4')).toBeInTheDocument()
    expect(screen.getByText('max Risk 4')).toBeInTheDocument()
  })

  it('lists damage scenarios without a threat scenario as open', async () => {
    const { api, second } = await apiWithSecondScenario()
    renderApp(`${project}/assets/a-03/risks`, api)

    const row = (await screen.findAllByRole('row'))[1]
    expect(within(row).getByRole('link', { name: new RegExp(`${second.code} Glare`) })).toBeInTheDocument()
    expect(within(row).getByText('No threat scenario linked')).toBeInTheDocument()
    expect(within(row).getByText('N/A')).toBeInTheDocument()
  })

  it('explains that an asset without damage scenarios has no risks yet', async () => {
    renderApp(`${project}/assets/a-02/risks`)

    expect(await screen.findByText(/No risks yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Link a damage scenario on the Relations tab' })).toHaveAttribute('href', `${project}/assets/a-02/relations`)
  })

  it('shows an error when the risks cannot be loaded', async () => {
    const api = createMockItemApi()
    api.assets.relations = fail
    renderApp(`${page}/risks`, api)

    expect(await screen.findByRole('alert')).toHaveTextContent('The risks could not be loaded.')
  })
})

describe('asset relations', () => {
  it('lists the damage scenarios with their properties and the threat scenarios that reach the asset', async () => {
    renderApp(`${page}/relations`)

    const damage = await findSection('Damage Scenarios')
    expect(damage.getByRole('link', { name: 'Headlamp turns off while driving at night' })).toHaveAttribute('href', `${project}/damage-scenarios/ds-01`)
    const properties = damage.getByRole('group', { name: 'DS-01 properties' })
    expect(within(properties).getAllByRole('button', { pressed: true }).map((button) => button.textContent)).toEqual(['I', 'A'])
    const targeting = section('Threat Scenarios Targeting It')
    expect(targeting.getByRole('link', { name: 'Spoofed headlamp command on the CAN bus' })).toHaveAttribute('href', `${project}/threat-scenarios/ts-01`)
    expect(targeting.getByLabelText('Properties I')).toBeInTheDocument()
    // Targets are chosen on the threat scenario, so these sections cannot change links.
    expect(targeting.queryByRole('button')).not.toBeInTheDocument()
    expect(section('Threat Scenarios Affecting It via Damage').getByText('No other threat scenario leads to a damage scenario of this asset.')).toBeInTheDocument()
  })

  it('lists threat scenarios that lead to its damage without targeting it as derived', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-02', 'ds-01')
    renderApp(`${page}/relations`, api)

    const viaDamage = await findSection('Threat Scenarios Affecting It via Damage')
    expect(viaDamage.getByRole('link', { name: 'Replayed headlamp command on the CAN bus' })).toBeInTheDocument()
    expect(viaDamage.getByText('via DS-01')).toBeInTheDocument()
  })

  it('links a damage scenario with all properties of the asset and refines them', async () => {
    const { api, second } = await apiWithSecondScenario()
    const { user } = renderApp(`${page}/relations`, api)

    await user.click((await findSection('Damage Scenarios')).getByRole('button', { name: 'Add Damage Scenario' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Add Damage Scenario' })).getByRole('button', { name: /Glare for oncoming traffic/ }))

    const properties = await section('Damage Scenarios').findByRole('group', { name: `${second.code} properties` })
    expect(within(properties).getAllByRole('button', { pressed: true }).map((button) => button.textContent)).toEqual(['I', 'A'])
    await user.click(within(properties).getByRole('button', { name: `${second.code} Availability` }))

    await waitFor(async () => expect((await api.assets.relations('headlamp', 'a-01')).damageScenarios.at(-1)?.linkedProperties).toEqual(['I']))
    expect(await screen.findByRole('link', { name: 'Relations 3' })).toBeInTheDocument()
  })

  it('removes a damage scenario link and the threat scenarios that reached the asset through it', async () => {
    const { user, api } = renderApp(`${page}/relations`)

    await user.click((await findSection('Damage Scenarios')).getByRole('button', { name: 'Remove link to DS-01 Headlamp turns off while driving at night' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove link' }))

    expect(await section('Damage Scenarios').findByText('No damage scenarios linked yet.')).toBeInTheDocument()
    expect(section('Threat Scenarios Targeting It').getByText('No threat scenario targets this asset yet.')).toBeInTheDocument()
    expect(await api.assets.relations('headlamp', 'a-01')).toEqual({ damageScenarios: [], threatScenarios: [] })
  })

  it('asks for a property before a damage scenario can be linked', async () => {
    const api = createMockItemApi()
    await api.assets.update('headlamp', 'a-02', { properties: [] })
    const { user } = renderApp(`${project}/assets/a-02/relations`, api)

    await user.click((await findSection('Damage Scenarios')).getByRole('button', { name: 'Add Damage Scenario' }))

    expect(within(await screen.findByRole('dialog')).getByRole('alert')).toHaveTextContent('Declare a cybersecurity property on the Definition tab first.')
  })

  it('shows an error when a link cannot be changed', async () => {
    const api = createMockItemApi()
    api.damageScenarios.unlinkAsset = fail
    const { user } = renderApp(`${page}/relations`, api)

    await user.click((await findSection('Damage Scenarios')).getByRole('button', { name: 'Remove link to DS-01 Headlamp turns off while driving at night' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove link' }))

    expect(await section('Damage Scenarios').findByRole('alert')).toHaveTextContent('The link could not be changed. Please try again.')
  })
})
