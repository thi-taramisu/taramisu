import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/errors'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'
const page = `${project}/attack-paths/ap-01`
const TS01 = 'TS-01 Spoofed headlamp command on the CAN bus'

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const section = (name: string) => within(screen.getByRole('region', { name }))
const findSection = async (name: string) => within(await screen.findByRole('region', { name }))
const fail = () => Promise.reject(new ApiError(500, 'Server error'))
const factor = (name: string) => within(screen.getByRole('radiogroup', { name }))
const findFactor = async (name: string) => within(await screen.findByRole('radiogroup', { name }))
const stepTexts = () => screen.getAllByRole('textbox', { name: /^Step / }).map((step) => (step as HTMLTextAreaElement).value)

describe('attack path page', () => {
  it('shows the tabs of the wireframe with Definition as default and the number of relations', async () => {
    renderApp(page)

    expect(await screen.findByRole('heading', { name: 'AP-01 Compromised navigation ECU via cellular' })).toBeInTheDocument()
    const tabs = within(screen.getByRole('navigation', { name: 'Attack path tabs' }))
    expect(tabs.getByRole('link', { name: 'Definition' })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('link', { name: 'Rating' })).toHaveAttribute('href', `${page}/rating`)
    expect(await tabs.findByRole('link', { name: 'Relations 1' })).toHaveAttribute('href', `${page}/relations`)
  })

  it('shows a not-found state for unknown attack paths', async () => {
    renderApp(`${project}/attack-paths/nope`)

    expect(await screen.findByRole('heading', { name: 'Attack path not found' })).toBeInTheDocument()
  })

  it('shows an error when the attack path cannot be loaded', async () => {
    const api = createMockItemApi()
    api.attackPaths.get = fail
    renderApp(page, api)

    expect(await screen.findByText('The attack path could not be loaded.')).toBeInTheDocument()
  })
})

describe('attack path definition', () => {
  it('shows the stored fields and steps in order', async () => {
    renderApp(page)

    expect(await screen.findByLabelText(/Name/)).toHaveDisplayValue('Compromised navigation ECU via cellular')
    expect(screen.getByLabelText('Analysis Approach')).toHaveDisplayValue('Top-Down')
    // The empty choice is only a placeholder, so a chosen approach cannot be emptied again.
    expect(within(screen.getByLabelText('Analysis Approach')).queryByRole('option', { name: 'Select…' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Partial Attack Path/ })).not.toBeChecked()
    expect(stepTexts()).toEqual([
      'Compromise the navigation ECU via its cellular connection.',
      'Send headlamp commands from the navigation ECU through the gateway.',
      'The body control ECU switches off the low beam.',
    ])
  })

  it('edits and saves the definition and renames the attack path in the tree', async () => {
    const { user, api } = renderApp(page)
    const name = await screen.findByLabelText(/Name/)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.clear(name)
    await user.type(name, ' Remote head unit exploit ')
    await user.selectOptions(screen.getByLabelText('Analysis Approach'), 'Bottom-Up')
    await user.click(screen.getByRole('checkbox', { name: /Partial Attack Path/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(await within(tree()).findByRole('link', { name: /AP-01 Remote head unit exploit/ })).toBeInTheDocument()
    expect(await api.attackPaths.get('headlamp', 'ap-01')).toMatchObject({ title: 'Remote head unit exploit', analysis_approach: 'BOTTOM_UP', is_partial_early_stage: true })
  })

  it('does not save a definition without a name', async () => {
    const { user } = renderApp(page)
    await user.clear(await screen.findByLabelText(/Name/))

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText(/Name/)).toHaveAccessibleDescription('Name is required.')
  })

  it('adds, reorders and removes steps and saves them with the Save button', async () => {
    const { user, api } = renderApp(page)
    await findSection('Steps')
    const steps = section('Steps')

    await user.click(steps.getByRole('button', { name: 'Add Step' }))
    await user.type(steps.getByRole('textbox', { name: 'Step 4' }), ' Glare the driver ')
    await user.click(steps.getByRole('button', { name: 'Move step 4 up' }))
    await user.click(steps.getByRole('button', { name: 'Remove step 1' }))

    expect(stepTexts()).toEqual([
      'Send headlamp commands from the navigation ECU through the gateway.',
      ' Glare the driver ',
      'The body control ECU switches off the low beam.',
    ])
    expect((await api.attackPaths.get('headlamp', 'ap-01')).attack_steps_and_weaknesses).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect((await api.attackPaths.get('headlamp', 'ap-01')).attack_steps_and_weaknesses?.map((step) => step.description)).toEqual([
      'Send headlamp commands from the navigation ECU through the gateway.',
      'Glare the driver',
      'The body control ECU switches off the low beam.',
    ])
  })

  it('does not move the first step further up and ignores empty new steps', async () => {
    const { user } = renderApp(page)
    const steps = await findSection('Steps')
    const before = stepTexts()

    await user.click(steps.getByRole('button', { name: 'Move step 1 up' }))
    expect(stepTexts()).toEqual(before)

    await user.click(steps.getByRole('button', { name: 'Add Step' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('treats a stored attack path without a step list as having no steps', async () => {
    const api = createMockItemApi()
    await api.attackPaths.update('headlamp', 'ap-03', { attack_steps_and_weaknesses: null })
    renderApp(`${project}/attack-paths/ap-03`, api)

    expect(await (await findSection('Steps')).findByText('No steps yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('shows an empty state without steps', async () => {
    renderApp(`${project}/attack-paths/ap-03`)

    expect(await (await findSection('Steps')).findByText('No steps yet.')).toBeInTheDocument()
  })

  it('shows an error and keeps the edits when saving fails', async () => {
    const api = createMockItemApi()
    api.attackPaths.update = fail
    const { user } = renderApp(page, api)
    await user.type(await screen.findByLabelText(/Name/), ' 2')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(screen.getByLabelText(/Name/)).toHaveDisplayValue('Compromised navigation ECU via cellular 2')
  })
})

describe('attack path rating', () => {
  const rating = `${page}/rating`

  it('shows the method picker, the stored factors, the total and the feasibility', async () => {
    renderApp(rating)

    const method = await screen.findByLabelText('Rating Method')
    expect(method).toHaveDisplayValue('Attack Potential')
    expect(within(method).getAllByRole('option')).toHaveLength(1)
    expect(factor('Elapsed Time').getByRole('radio', { name: '≤6 months 17 points' })).toBeChecked()
    expect(factor('Elapsed Time').getAllByRole('radio')).toHaveLength(5)
    expect(factor('Window of Opportunity').getByRole('radio', { name: 'Easy 1 point' })).toBeChecked()
    expect(screen.getByText('21 points')).toBeInTheDocument()
    expect(screen.getByText('Low feasibility')).toBeInTheDocument()
  })

  it('recalculates while editing and saves the factors, total and feasibility', async () => {
    const { user, api } = renderApp(rating)
    await user.click((await findFactor('Elapsed Time')).getByRole('radio', { name: '≤1 month 4 points' }))

    // The same text can be an option of a factor, so the total is checked next to the feasibility.
    expect(screen.getByText('High feasibility').parentElement).toHaveTextContent('8 points')

    await user.clear(screen.getByLabelText('Rationale'))
    await user.type(screen.getByLabelText('Rationale'), ' Tested in the lab ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(await api.attackPaths.rating('headlamp', 'ap-01')).toMatchObject({ ap_elapsed_time: 4, ap_total_score: 8, feasibility_rating: 'HIGH', rationale: 'Tested in the lab' })
  })

  it('starts unrated, shows open factors and can be saved as a draft', async () => {
    const { user, api } = renderApp(`${project}/attack-paths/ap-03/rating`)

    expect(await screen.findByText('5 of 5 factors open')).toBeInTheDocument()
    await user.click(factor('Equipment').getByRole('radio', { name: 'Bespoke 7 points' }))
    expect(screen.getByText('4 of 5 factors open')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(await api.attackPaths.rating('headlamp', 'ap-03')).toMatchObject({ ap_equipment: 7, ap_total_score: null, feasibility_rating: null })
  })

  it('shows an error and keeps the values when saving fails', async () => {
    const api = createMockItemApi()
    api.attackPaths.updateRating = fail
    const { user } = renderApp(rating, api)
    await user.click((await findFactor('Equipment')).getByRole('radio', { name: 'Bespoke 7 points' }))

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The rating could not be saved')
    expect(factor('Equipment').getByRole('radio', { name: 'Bespoke 7 points' })).toBeChecked()
  })

  it('offers the same choice as a dropdown for narrow screens', async () => {
    const { user } = renderApp(rating)
    await findFactor('Equipment')
    const dropdown = screen.getByRole('combobox', { name: 'Equipment' })
    expect(dropdown).toHaveDisplayValue('Standard · 0 points')

    await user.selectOptions(dropdown, 'Bespoke · 7 points')

    expect(factor('Equipment').getByRole('radio', { name: 'Bespoke 7 points' })).toBeChecked()
  })

  it('clears a single factor and opens the result again', async () => {
    const { user } = renderApp(rating)
    await findFactor('Equipment')
    expect(screen.getByRole('button', { name: 'Clear Equipment' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Clear Equipment' }))

    expect(factor('Equipment').queryByRole('radio', { checked: true })).not.toBeInTheDocument()
    expect(screen.getByText('1 of 5 factors open')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear Equipment' })).toBeDisabled()
  })

  it('shows an error when the rating cannot be loaded', async () => {
    const api = createMockItemApi()
    api.attackPaths.rating = fail
    renderApp(rating, api)

    expect(await screen.findByText('The rating could not be loaded.')).toBeInTheDocument()
  })

  it('shows a loading state until the rating arrives', async () => {
    const api = createMockItemApi()
    api.attackPaths.rating = () => new Promise(() => undefined)
    renderApp(rating, api)

    expect(await screen.findByText('Loading rating…')).toBeInTheDocument()
  })
})

describe('attack path relations', () => {
  const relations = `${page}/relations`

  it('lists the threat scenarios above in the hierarchy', async () => {
    renderApp(relations)

    const threats = await findSection('Threat Scenarios')
    expect(threats.getByTitle('Above in the hierarchy')).toBeInTheDocument()
    expect(threats.getByRole('link', { name: 'Spoofed headlamp command on the CAN bus' })).toHaveAttribute('href', `${project}/threat-scenarios/ts-01`)
  })

  it('links a further threat scenario and updates the count', async () => {
    const { user, api } = renderApp(relations)

    await user.click((await findSection('Threat Scenarios')).getByRole('button', { name: 'Add Threat Scenario' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Add Threat Scenario' })).getByRole('button', { name: /TS-02/ }))

    expect(await section('Threat Scenarios').findByRole('link', { name: 'Replayed headlamp command on the CAN bus' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Relations 2' })).toBeInTheDocument()
    expect((await api.threatScenarios.relations('headlamp', 'ts-02')).attackPaths.map((path) => path.code)).toEqual(['AP-01'])
  })

  it('removes a link after confirmation and keeps the attack path', async () => {
    const { user, api } = renderApp(relations)

    await user.click((await findSection('Threat Scenarios')).getByRole('button', { name: `Remove link to ${TS01}` }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove link' }))

    expect(await section('Threat Scenarios').findByText('No threat scenarios linked yet.')).toBeInTheDocument()
    await waitFor(() => expect(within(tree()).queryByRole('link', { name: /AP-01/ })).not.toBeInTheDocument())
    expect(await api.content.attackPaths('headlamp', 'i-01')).toContainEqual(expect.objectContaining({ code: 'AP-01' }))
  })

  it('shows an error and keeps the links when saving fails', async () => {
    const api = createMockItemApi()
    api.attackPaths.linkThreatScenario = fail
    const { user } = renderApp(relations, api)

    await user.click((await findSection('Threat Scenarios')).getByRole('button', { name: 'Add Threat Scenario' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Add Threat Scenario' })).getByRole('button', { name: /TS-03/ }))

    expect(await section('Threat Scenarios').findByRole('alert')).toHaveTextContent('The link could not be changed')
    expect(section('Threat Scenarios').getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows an error when the relations cannot be loaded', async () => {
    const api = createMockItemApi()
    api.attackPaths.relations = fail
    renderApp(relations, api)

    expect(await screen.findByText('The relations could not be loaded.')).toBeInTheDocument()
  })

  it('shows a loading state until the relations arrive', async () => {
    const api = createMockItemApi()
    api.attackPaths.relations = () => new Promise(() => undefined)
    renderApp(relations, api)

    expect(await screen.findByText('Loading relations…')).toBeInTheDocument()
  })
})
