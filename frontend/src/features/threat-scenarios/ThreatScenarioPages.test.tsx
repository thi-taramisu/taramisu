import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/errors'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'
const page = `${project}/threat-scenarios/ts-01`
const DS01 = 'DS-01 Headlamp turns off while driving at night'

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const section = (name: string) => within(screen.getByRole('region', { name }))
const findSection = async (name: string) => within(await screen.findByRole('region', { name }))
const findTargets = async () => within(await screen.findByRole('group', { name: 'Targeted Assets and Compromised Properties' }))
const fail = () => Promise.reject(new ApiError(500, 'Server error'))

async function removeLink(user: ReturnType<typeof renderApp>['user'], sectionName: string, name: string) {
  await user.click((await findSection(sectionName)).getByRole('button', { name: `Remove link to ${name}` }))
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove link' }))
}

/** A second damage scenario with both properties of A-01, so a target can be switched. */
async function apiWithSecondScenario() {
  const api = createMockItemApi()
  const second = await api.damageScenarios.create('headlamp', {
    item_definition_id: 'i-01',
    title: 'Glare for oncoming traffic',
    asset_properties: [{ asset_id: 'a-03', property: 'I' }],
  })
  return { api, second }
}

describe('threat scenario page', () => {
  it('shows the tabs of the wireframe with Definition as default and the number of relations', async () => {
    renderApp(page)

    expect(await screen.findByRole('heading', { name: 'TS-01 Spoofed headlamp command on the CAN bus' })).toBeInTheDocument()
    const tabs = within(screen.getByRole('navigation', { name: 'Threat scenario tabs' }))
    expect(tabs.getByRole('link', { name: 'Definition' })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('link', { name: 'Risks' })).toHaveAttribute('href', `${page}/risks`)
    expect(tabs.getByRole('link', { name: 'Treatment' })).toHaveAttribute('href', `${page}/treatment`)
    expect(await tabs.findByRole('link', { name: 'Relations 3' })).toHaveAttribute('href', `${page}/relations`)
  })

  it.each([
    ['risks', 'Risks'],
    ['treatment', 'Treatment'],
  ])('keeps the %s tab as a placeholder', async (path, title) => {
    renderApp(`${page}/${path}`)

    expect(await screen.findByText(`${title}: not implemented yet`)).toBeInTheDocument()
  })

  it('shows a not-found state for unknown threat scenarios', async () => {
    renderApp(`${project}/threat-scenarios/nope`)

    expect(await screen.findByRole('heading', { name: 'Threat scenario not found' })).toBeInTheDocument()
  })

  it('shows an error when the threat scenario cannot be loaded', async () => {
    const api = createMockItemApi()
    api.threatScenarios.get = fail
    renderApp(page, api)

    expect(await screen.findByText('The threat scenario could not be loaded.')).toBeInTheDocument()
  })
})

describe('threat scenario definition', () => {
  it('shows the stored fields', async () => {
    renderApp(page)

    expect(await screen.findByLabelText(/Name/)).toHaveDisplayValue('Spoofed headlamp command on the CAN bus')
    expect(screen.getByLabelText('Cause of Compromise')).toHaveDisplayValue('Spoofing of CAN messages')
    expect(screen.getByLabelText('Elicitation')).toHaveDisplayValue('STRIDE')
    expect(screen.getByLabelText('Technical Notes')).toHaveDisplayValue('Needs access to the vehicle CAN bus behind the gateway.')
  })

  it('edits and saves the definition and renames the threat scenario in the tree', async () => {
    const { user, api } = renderApp(page)
    const name = await screen.findByLabelText(/Name/)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.clear(name)
    await user.type(name, ' Forged low beam command ')
    await user.clear(screen.getByLabelText('Cause of Compromise'))
    await user.selectOptions(screen.getByLabelText('Elicitation'), 'Not set')
    await user.clear(screen.getByLabelText('Technical Notes'))
    await user.type(screen.getByLabelText('Technical Notes'), 'Attacker with OBD access')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'TS-01 Forged low beam command' })).toBeInTheDocument()
    expect(await within(tree()).findByRole('link', { name: /TS-01 Forged low beam command/ })).toBeInTheDocument()
    expect(await api.threatScenarios.get('headlamp', 'ts-01')).toMatchObject({ title: 'Forged low beam command', cause_of_compromise: null, elicitation_method: null, technical_notes: 'Attacker with OBD access' })
  })

  it('does not save a definition without a name', async () => {
    const { user } = renderApp(page)
    await user.clear(await screen.findByLabelText(/Name/))

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText(/Name/)).toHaveAccessibleDescription('Name is required.')
  })

  it('shows an error and keeps the edits when saving fails', async () => {
    const api = createMockItemApi()
    api.threatScenarios.update = fail
    const { user } = renderApp(page, api)
    await user.type(await screen.findByLabelText('Cause of Compromise'), ' via gateway')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(screen.getByLabelText('Cause of Compromise')).toHaveDisplayValue('Spoofing of CAN messages via gateway')
  })

  it('lists the asset properties with the current target and has no damage scenario management', async () => {
    renderApp(page)

    const field = await findTargets()
    expect(field.getByRole('checkbox', { name: 'A-01 Headlamp on/off command · Integrity' })).toBeChecked()
    expect(field.getByRole('checkbox', { name: 'A-01 Headlamp on/off command · Availability' })).not.toBeChecked()
    expect(screen.queryByRole('button', { name: 'Add Damage Scenario' })).not.toBeInTheDocument()
  })

  it('groups the targets by damage scenario and keeps the choice of an asset in sync', async () => {
    const api = createMockItemApi()
    const second = await api.damageScenarios.create('headlamp', {
      item_definition_id: 'i-01',
      title: 'Headlamp cannot be switched on',
      asset_properties: [{ asset_id: 'a-01', property: 'A' }],
    })
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-01', second.id)
    const { user } = renderApp(page, api)
    const field = await findTargets()
    const firstGroup = within(field.getByRole('group', { name: DS01 }))
    const secondGroup = within(field.getByRole('group', { name: `${second.code} Headlamp cannot be switched on` }))
    expect(firstGroup.getAllByRole('checkbox')).toHaveLength(2)
    expect(secondGroup.getAllByRole('checkbox')).toHaveLength(1)

    await user.click(secondGroup.getByRole('checkbox', { name: /· Availability/ }))

    expect(firstGroup.getByRole('checkbox', { name: /· Availability/ })).toBeChecked()
    expect(firstGroup.getByRole('checkbox', { name: /· Integrity/ })).toBeChecked()
  })

  it('says when no asset leads to a linked damage scenario', async () => {
    const api = createMockItemApi()
    await api.damageScenarios.unlinkAsset('headlamp', 'ds-01', 'a-01')
    renderApp(page, api)

    expect((await findTargets()).getByText('No asset leads to this damage scenario yet.')).toBeInTheDocument()
  })

  it('saves a changed target only with the Save button below the targets', async () => {
    const { user, api } = renderApp(page)
    const field = await findTargets()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(field.getByRole('checkbox', { name: /· Integrity/ }).compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(field.getByRole('checkbox', { name: /· Availability/ }))

    expect(field.getByRole('checkbox', { name: /· Availability/ })).toBeChecked()
    expect((await api.threatScenarios.relations('headlamp', 'ts-01')).targets).toEqual([{ assetId: 'a-01', property: 'I' }])

    await user.click(save)

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect((await api.threatScenarios.relations('headlamp', 'ts-01')).targets).toEqual([
      { assetId: 'a-01', property: 'I' },
      { assetId: 'a-01', property: 'A' },
    ])
  })

  it('counts going back to the saved target as no change', async () => {
    const { user } = renderApp(page)
    const field = await findTargets()
    const save = screen.getByRole('button', { name: 'Save' })

    await user.click(field.getByRole('checkbox', { name: /· Availability/ }))
    expect(save).toBeEnabled()
    await user.click(field.getByRole('checkbox', { name: /· Availability/ }))

    expect(save).toBeDisabled()
  })

  it('saves a draft without any target', async () => {
    const { user, api } = renderApp(page)
    const field = await findTargets()

    await user.click(field.getByRole('checkbox', { name: /· Integrity/ }))

    expect(field.getByRole('checkbox', { name: /· Integrity/ })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect((await api.threatScenarios.relations('headlamp', 'ts-01')).targets).toEqual([])
  })

  it('points to the Relations tab while no damage scenario is linked', async () => {
    renderApp(`${project}/threat-scenarios/ts-02`)

    const field = await findTargets()
    expect(field.getByRole('link', { name: 'Link a damage scenario on the Relations tab' })).toHaveAttribute('href', `${project}/threat-scenarios/ts-02/relations`)
  })

  it('shows an error and keeps the selection when saving the targets fails', async () => {
    const api = createMockItemApi()
    api.threatScenarios.setTargets = fail
    const { user } = renderApp(page, api)
    const field = await findTargets()

    await user.click(field.getByRole('checkbox', { name: /· Availability/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(field.getByRole('checkbox', { name: /· Availability/ })).toBeChecked()
  })

  it('shows an error when the targets cannot be loaded', async () => {
    const api = createMockItemApi()
    api.threatScenarios.relations = fail
    renderApp(page, api)

    expect(await screen.findByText('The targets could not be loaded.')).toBeInTheDocument()
  })

  it('shows a loading state until the targets arrive', async () => {
    const api = createMockItemApi()
    api.threatScenarios.relations = () => new Promise(() => undefined)
    renderApp(page, api)

    expect(await screen.findByText('Loading targets…')).toBeInTheDocument()
  })
})

describe('threat scenario relations', () => {
  const relations = `${page}/relations`

  it('lists the damage scenarios above and the attack paths below in the hierarchy', async () => {
    renderApp(relations)

    const damage = await findSection('Damage Scenarios')
    expect(damage.getByTitle('Above in the hierarchy')).toBeInTheDocument()
    expect(damage.getByRole('link', { name: 'Headlamp turns off while driving at night' })).toHaveAttribute('href', `${project}/damage-scenarios/ds-01`)
    const paths = section('Attack Paths')
    expect(paths.getByTitle('Below in the hierarchy')).toBeInTheDocument()
    expect(paths.getAllByRole('listitem')).toHaveLength(2)
  })

  it('adds an attack path and shows it in the tree and the tab count', async () => {
    const { user } = renderApp(relations)

    await user.click((await findSection('Attack Paths')).getByRole('button', { name: 'Add Attack Path' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Add Attack Path' })).getByRole('button', { name: /AP-03/ }))

    expect(await section('Attack Paths').findByRole('link', { name: 'Manipulated firmware update in the workshop' })).toBeInTheDocument()
    expect(await within(tree()).findByRole('link', { name: /AP-03/ })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Relations 4' })).toBeInTheDocument()
  })

  it('removes an attack path link and keeps the attack path available', async () => {
    const { user, api } = renderApp(relations)

    await removeLink(user, 'Attack Paths', 'AP-01 Compromised navigation ECU via cellular')

    await waitFor(() => expect(section('Attack Paths').getAllByRole('listitem')).toHaveLength(1))
    await waitFor(() => expect(within(tree()).queryByRole('link', { name: /AP-01/ })).not.toBeInTheDocument())
    expect(await api.content.attackPaths('headlamp', 'i-01')).toContainEqual(expect.objectContaining({ code: 'AP-01' }))
  })

  it('creates a damage scenario from the add dialog with the typed name and links it', async () => {
    const { user, api } = renderApp(relations)
    await user.click((await findSection('Damage Scenarios')).getByRole('button', { name: 'Add Damage Scenario' }))
    const picker = within(await screen.findByRole('dialog', { name: 'Add Damage Scenario' }))

    await user.type(picker.getByRole('textbox'), 'Headlamp flickers')
    await user.click(picker.getByRole('button', { name: 'Create "Headlamp flickers" as new Damage Scenario…' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'New Damage Scenario' }))
    expect(dialog.getByLabelText(/Name/)).toHaveDisplayValue('Headlamp flickers')
    // The link only works within the item of the threat scenario.
    expect(dialog.getByLabelText('Item')).toBeDisabled()
    await user.click(dialog.getByRole('button', { name: 'Add Asset' }))
    await user.click(await screen.findByRole('menuitem', { name: /A-03 Camera image data/ }))
    await user.click(dialog.getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'DS-02 Headlamp flickers' })).toBeInTheDocument()
    expect((await api.threatScenarios.relations('headlamp', 'ts-01')).damageScenarios.map((ds) => ds.code)).toEqual(['DS-01', 'DS-02'])
  })

  it('adds a damage scenario and offers its causes as targets on the Definition tab', async () => {
    const { api, second } = await apiWithSecondScenario()
    const { user } = renderApp(relations, api)

    await user.click((await findSection('Damage Scenarios')).getByRole('button', { name: 'Add Damage Scenario' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Add Damage Scenario' })).getByRole('button', { name: new RegExp(second.code) }))
    await section('Damage Scenarios').findByRole('link', { name: 'Glare for oncoming traffic' })
    await user.click(screen.getByRole('link', { name: 'Definition' }))

    expect((await findTargets()).getByRole('checkbox', { name: 'A-03 Camera image data · Integrity' })).not.toBeChecked()
  })

  it('removes the target together with the link to its damage scenario after a warning', async () => {
    const { user, api } = renderApp(relations)

    await user.click((await findSection('Damage Scenarios')).getByRole('button', { name: `Remove link to ${DS01}` }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveAccessibleDescription(
      'The damage scenario stays in the project. The link and any threat scenario targets that depend on it are removed.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Remove link' }))

    expect(await section('Damage Scenarios').findByText('No damage scenarios linked yet.')).toBeInTheDocument()
    expect((await api.threatScenarios.relations('headlamp', 'ts-01')).targets).toEqual([])
  })

  it('shows an error and keeps the links when saving fails', async () => {
    const api = createMockItemApi()
    api.threatScenarios.linkAttackPath = fail
    const { user } = renderApp(relations, api)

    await user.click((await findSection('Attack Paths')).getByRole('button', { name: 'Add Attack Path' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Add Attack Path' })).getByRole('button', { name: /AP-03/ }))

    expect(await section('Attack Paths').findByRole('alert')).toHaveTextContent('The link could not be changed')
    expect(section('Attack Paths').getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows an error when the relations cannot be loaded', async () => {
    const api = createMockItemApi()
    api.threatScenarios.relations = fail
    renderApp(relations, api)

    expect(await screen.findByText('The relations could not be loaded.')).toBeInTheDocument()
  })

  it('shows a loading state until the relations arrive', async () => {
    const api = createMockItemApi()
    api.threatScenarios.relations = () => new Promise(() => undefined)
    renderApp(relations, api)

    expect(await screen.findByText('Loading relations…')).toBeInTheDocument()
  })
})
