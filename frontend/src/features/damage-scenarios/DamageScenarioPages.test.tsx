import { act, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { createMockItemApi } from '../../api/mocks/mockItemApi'

const project = '/projects/headlamp'
const page = `${project}/damage-scenarios/ds-01`

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const category = (name: string) => within(screen.getByRole('radiogroup', { name }))
const radio = (name: string, rating: string) => category(name).getByRole('radio', { name: rating })

const location = () => screen.getByTestId('location')

async function openNewDamageScenarioDialog(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await within(tree()).findByRole('button', { name: 'New' }))
  await user.click(screen.getByRole('menuitem', { name: 'Damage Scenario' }))
  return screen.getByRole('dialog', { name: 'New Damage Scenario' })
}

describe('create damage scenario', () => {
  it('starts with the item and asset of the current page and creates the damage scenario below the asset', async () => {
    const { user, api } = renderApp(`${project}/assets/a-04`)
    const dialog = await openNewDamageScenarioDialog(user)

    expect(within(dialog).getByLabelText('Item')).toHaveDisplayValue('Headlamp system')
    expect(within(dialog).getByRole('button', { name: 'A-04 Confidentiality' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'A-04 Integrity' }))
    await user.type(within(dialog).getByLabelText(/Name/), 'Diagnostic key leaked')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'DS-02 Diagnostic key leaked' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const created = (await api.content.children('headlamp', 'i-01')).find((node) => node.id === 'a-04')!.children![0]
    expect(location()).toHaveTextContent(`${project}/damage-scenarios/${created.id}`)
    expect(within(tree()).getByRole('link', { name: 'DS-02 Diagnostic key leaked' })).toHaveAttribute('aria-current', 'page')
    expect((await api.content.assets('headlamp', 'i-01')).find((asset) => asset.id === 'a-04')).toMatchObject({ damageScenarios: 1 })
  })

  it('takes the item and asset of the page when the tree loads after opening', async () => {
    const api = createMockItemApi()
    const list = api.items.list
    let loadTree!: () => void
    // Only the first request waits, the refetch after creating answers at once.
    api.items.list = (projectId) => {
      api.items.list = list
      return new Promise((resolve) => {
        loadTree = () => resolve(list(projectId))
      })
    }
    const { user } = renderApp(`${project}/assets/a-04`, api)
    const dialog = await openNewDamageScenarioDialog(user)

    act(() => loadTree())

    expect(await within(dialog).findByRole('button', { name: 'A-04 Confidentiality' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByLabelText('Item')).toHaveDisplayValue('Headlamp system')
    await user.type(within(dialog).getByLabelText(/Name/), 'Diagnostic key leaked')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))
    expect(await screen.findByRole('heading', { name: 'DS-02 Diagnostic key leaked' })).toBeInTheDocument()
  })

  it('links further assets with the properties they have', async () => {
    const { user } = renderApp(project)
    const dialog = await openNewDamageScenarioDialog(user)

    await user.click(within(dialog).getByRole('button', { name: 'Add Asset' }))
    await user.click(screen.getByRole('menuitem', { name: /A-03 Camera image data/ }))

    const properties = within(dialog).getByRole('group', { name: 'A-03 properties' })
    expect(within(properties).getAllByRole('button', { pressed: true }).map((button) => button.textContent)).toEqual(['I', 'A'])
    expect(within(properties).queryByRole('button', { name: 'A-03 Confidentiality' })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Remove A-03 Camera image data' }))
    expect(within(dialog).queryByRole('group', { name: 'A-03 properties' })).not.toBeInTheDocument()
  })

  it('drops the linked assets when another item is chosen', async () => {
    const api = createMockItemApi()
    await api.items.create('headlamp', { name: 'Rear lights', scope_type: 'ITEM' })
    const { user } = renderApp(`${project}/assets/a-04`, api)
    const dialog = await openNewDamageScenarioDialog(user)
    expect(within(dialog).getByRole('group', { name: 'A-04 properties' })).toBeInTheDocument()

    await user.selectOptions(within(dialog).getByLabelText('Item'), 'Rear lights')
    expect(within(dialog).queryByRole('group', { name: 'A-04 properties' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add Asset' })).toBeDisabled()

    // Assets belong to one item, so going back does not bring the link back either.
    await user.selectOptions(within(dialog).getByLabelText('Item'), 'Headlamp system')
    expect(within(dialog).queryByRole('group', { name: 'A-04 properties' })).not.toBeInTheDocument()
  })

  it('requires a name, a linked asset and a property per asset', async () => {
    const { user, api } = renderApp(`${project}/assets/a-02`)
    const dialog = await openNewDamageScenarioDialog(user)

    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))
    expect(within(dialog).getByLabelText(/Name/)).toHaveAccessibleDescription('Name is required.')

    await user.type(within(dialog).getByLabelText(/Name/), 'Manipulated firmware')
    await user.click(within(dialog).getByRole('button', { name: 'A-02 Integrity' }))
    expect(within(dialog).getByRole('button', { name: 'A-02 Integrity' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Select at least one property of A-02.')

    await user.click(within(dialog).getByRole('button', { name: 'Remove A-02 Body control ECU firmware' }))
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Link at least one asset.')
    expect((await api.content.children('headlamp', 'i-01')).find((node) => node.id === 'a-02')!.children).toBeUndefined()
  })

  it('does not create before the assets of the item are loaded', async () => {
    const api = createMockItemApi()
    const assets = api.content.assets
    let loadAssets!: () => void
    // Only the first request for the item waits, the refetch after creating answers at once.
    api.content.assets = (projectId, itemId) => {
      if (itemId !== 'i-01') return assets(projectId, itemId)
      api.content.assets = assets
      return new Promise((resolve) => {
        loadAssets = () => resolve(assets(projectId, itemId))
      })
    }
    const { user } = renderApp(`${project}/assets/a-02`, api)
    const dialog = await openNewDamageScenarioDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Manipulated firmware')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('The assets are still loading.')

    act(() => loadAssets())
    await within(dialog).findByRole('button', { name: 'A-02 Integrity' })
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))
    expect(await screen.findByRole('heading', { name: 'DS-02 Manipulated firmware' })).toBeInTheDocument()
  })

  it('keeps the dialog open with "Create & add another"', async () => {
    const { user } = renderApp(`${project}/assets/a-02`)
    const dialog = await openNewDamageScenarioDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Manipulated firmware')
    await user.click(within(dialog).getByRole('button', { name: 'Create & add another' }))

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Manipulated firmware created.')
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: 'A-02 Integrity' })).toHaveAttribute('aria-pressed', 'true')
    expect(location()).toHaveTextContent(`${project}/assets/a-02`)
  })

  it('returns focus to the New button after Cancel', async () => {
    const { user } = renderApp(`${project}/assets/a-02`)
    const dialog = await openNewDamageScenarioDialog(user)

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(tree()).getByRole('button', { name: 'New' })).toHaveFocus()
  })

  it('shows an error and keeps the dialog open when creating fails', async () => {
    const api = createMockItemApi()
    api.damageScenarios.create = () => Promise.reject(new Error('network'))
    const { user } = renderApp(`${project}/assets/a-02`, api)
    const dialog = await openNewDamageScenarioDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Manipulated firmware')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('could not be created')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('damage scenario page', () => {
  it('shows the type label, code and title in the header', async () => {
    renderApp(page)

    const header = (await screen.findByRole('heading', { name: 'DS-01 Headlamp turns off while driving at night' })).parentElement!
    expect(within(header).getByText('Damage scenario')).toBeInTheDocument()
  })

  it('shows a not-found state for unknown damage scenarios', async () => {
    renderApp(`${project}/damage-scenarios/unknown`)

    expect(await screen.findByRole('heading', { name: 'Damage scenario not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to project' })).toHaveAttribute('href', project)
    expect(screen.queryByRole('navigation', { name: 'Damage scenario tabs' })).not.toBeInTheDocument()
  })

  it('keeps the damage scenario page when a refetch of the loaded damage scenario fails', async () => {
    const api = createMockItemApi()
    const { user } = renderApp(page, api)

    const harm = await screen.findByLabelText('Harm To Road User')
    await user.type(harm, ' Glare.')
    // The save invalidates the damage scenario; its refetch fails, but the loaded data is still valid.
    api.damageScenarios.get = () => Promise.reject(new Error('network'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be refreshed')
    expect(screen.getByRole('heading', { name: 'DS-01 Headlamp turns off while driving at night' })).toBeInTheDocument()
    expect(screen.getByLabelText('Harm To Road User')).toHaveDisplayValue(/ Glare\.$/)
  })

  it('keeps the relations tab as a placeholder', async () => {
    renderApp(`${page}/relations`)

    expect(await screen.findByText('Relations: not implemented yet')).toBeInTheDocument()
  })
})

describe('damage scenario definition', () => {
  it('edits and saves the definition and renames the damage scenario in the tree', async () => {
    const { user, api } = renderApp(page)

    const name = await screen.findByLabelText(/Name/)
    expect(name).toHaveValue('Headlamp turns off while driving at night')
    expect(screen.getByLabelText('Relation To Item Functionality')).toHaveDisplayValue(/low beam/)
    expect(screen.getByLabelText('Harm To Road User')).toHaveDisplayValue(/collision/)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.clear(name)
    await user.type(name, '  Low beam fails at night ')
    await user.clear(screen.getByLabelText('Harm To Road User'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'DS-01 Low beam fails at night' })).toBeInTheDocument()
    expect(within(tree()).getByRole('link', { name: 'DS-01 Low beam fails at night' })).toBeInTheDocument()
    expect(await api.damageScenarios.get('headlamp', 'ds-01')).toMatchObject({
      title: 'Low beam fails at night',
      road_user_harm_description: null,
    })
  })

  it('does not save a definition without a name', async () => {
    const { user, api } = renderApp(page)

    await user.clear(await screen.findByLabelText(/Name/))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText(/Name/)).toHaveAccessibleDescription('Name is required.')
    expect((await api.damageScenarios.get('headlamp', 'ds-01')).title).toBe('Headlamp turns off while driving at night')
  })

  it('shows an error and keeps the edits when saving fails', async () => {
    const api = createMockItemApi()
    api.damageScenarios.update = () => Promise.reject(new Error('network'))
    const { user } = renderApp(page, api)

    await user.type(await screen.findByLabelText('Harm To Road User'), ' Glare.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(screen.getByLabelText('Harm To Road User')).toHaveDisplayValue(/Glare\.$/)
  })
})

describe('damage scenario impact', () => {
  it('shows the stored rating per category', async () => {
    renderApp(`${page}/impact`)

    expect(await screen.findByRole('radio', { name: 'Severe', checked: true })).toBe(radio('Safety', 'Severe'))
    expect(radio('Operational', 'Moderate')).toBeChecked()
    expect(radio('Privacy', 'Omitted')).toBeChecked()
    expect(category('Financial').queryByRole('radio', { checked: true })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear Financial' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear Safety' })).toBeEnabled()
  })

  it('clears the rating and the rationale of a category', async () => {
    const { user, api } = renderApp(`${page}/impact`)

    await user.click(await screen.findByRole('button', { name: 'Clear Operational' }))
    expect(category('Operational').queryByRole('radio', { checked: true })).not.toBeInTheDocument()
    expect(screen.queryByText('The vehicle cannot be driven at night until repaired.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear Operational' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    const ratings = await api.damageScenarios.impactRatings('headlamp', 'ds-01')
    expect(ratings.find((r) => r.impact_category === 'OPERATIONAL')).toMatchObject({
      rating_value: null,
      is_omitted_by_pm_15_07: false,
      omission_or_rating_rationale: null,
    })
  })

  it('hides the rationale until it is opened', async () => {
    const { user } = renderApp(`${page}/impact`)

    const toggle = await screen.findByRole('button', { name: 'Safety Rationale' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Financial Rationale' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('Severity S3 from the HARA of the headlamp system.')).toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('textbox', { name: 'Safety rationale' })).toHaveValue('Severity S3 from the HARA of the headlamp system.')
  })

  it('opens the rationale when a category is omitted', async () => {
    const { user } = renderApp(`${page}/impact`)

    await screen.findByRole('radiogroup', { name: 'Financial' })
    await user.click(radio('Financial', 'Omitted'))

    expect(screen.getByRole('textbox', { name: 'Financial rationale' })).toBeVisible()
  })

  it('rates and omits categories and saves them', async () => {
    const { user, api } = renderApp(`${page}/impact`)

    await screen.findByRole('radiogroup', { name: 'Financial' })
    await user.click(radio('Financial', 'Major'))
    expect(radio('Financial', 'Major')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Financial Rationale' }))
    await user.type(screen.getByRole('textbox', { name: 'Financial rationale' }), 'Recall of the vehicle series')
    await user.click(radio('Operational', 'Omitted'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    const ratings = await api.damageScenarios.impactRatings('headlamp', 'ds-01')
    expect(ratings.find((r) => r.impact_category === 'FINANCIAL')).toMatchObject({
      rating_value: 'MAJOR',
      is_omitted_by_pm_15_07: false,
      omission_or_rating_rationale: 'Recall of the vehicle series',
    })
    expect(ratings.find((r) => r.impact_category === 'OPERATIONAL')).toMatchObject({ rating_value: 'OMITTED', is_omitted_by_pm_15_07: true })
    // Not editable for now, but saving keeps the stored flag.
    expect(ratings.find((r) => r.impact_category === 'SAFETY')).toMatchObject({ rating_value: 'SEVERE', reused_from_functional_safety: true })
  })

  it('saves the rationale trimmed and a blank one as none', async () => {
    const { user, api } = renderApp(`${page}/impact`)

    await screen.findByRole('radiogroup', { name: 'Financial' })
    await user.click(radio('Financial', 'Major'))
    await user.click(screen.getByRole('button', { name: 'Financial Rationale' }))
    await user.type(screen.getByRole('textbox', { name: 'Financial rationale' }), '  Recall of the vehicle series  ')
    await user.click(screen.getByRole('button', { name: 'Operational Rationale' }))
    await user.clear(screen.getByRole('textbox', { name: 'Operational rationale' }))
    await user.type(screen.getByRole('textbox', { name: 'Operational rationale' }), '   ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    const ratings = await api.damageScenarios.impactRatings('headlamp', 'ds-01')
    expect(ratings.find((r) => r.impact_category === 'FINANCIAL')?.omission_or_rating_rationale).toBe('Recall of the vehicle series')
    expect(ratings.find((r) => r.impact_category === 'OPERATIONAL')?.omission_or_rating_rationale).toBeNull()
  })

  it('requires a rationale to omit a category', async () => {
    const { user, api } = renderApp(`${page}/impact`)

    await screen.findByRole('radiogroup', { name: 'Financial' })
    await user.click(radio('Financial', 'Omitted'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const rationale = screen.getByRole('textbox', { name: 'Financial rationale' })
    expect(rationale).toHaveAccessibleDescription('A rationale is required to omit Financial.')
    expect(await api.damageScenarios.impactRatings('headlamp', 'ds-01')).toHaveLength(3)

    await user.type(rationale, 'Covered by the safety rating')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('omits a category only in favour of a rated one', async () => {
    const api = createMockItemApi()
    await api.damageScenarios.updateImpactRatings('headlamp', 'ds-01', [
      { impact_category: 'SAFETY', rating_value: null, is_omitted_by_pm_15_07: false, omission_or_rating_rationale: null, reused_from_functional_safety: false },
      { impact_category: 'OPERATIONAL', rating_value: null, is_omitted_by_pm_15_07: false, omission_or_rating_rationale: null, reused_from_functional_safety: false },
    ])
    const { user } = renderApp(`${page}/impact`, api)

    await screen.findByRole('radiogroup', { name: 'Financial' })
    await user.click(radio('Financial', 'Omitted'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
      'Financial can only be omitted if another category is rated.',
      'Privacy can only be omitted if another category is rated.',
    ])
  })

  it('shows an error and keeps the ratings when saving fails', async () => {
    const api = createMockItemApi()
    api.damageScenarios.updateImpactRatings = () => Promise.reject(new Error('network'))
    const { user } = renderApp(`${page}/impact`, api)

    await screen.findByRole('radiogroup', { name: 'Financial' })
    await user.click(radio('Financial', 'Negligible'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(radio('Financial', 'Negligible')).toBeChecked()
  })

  it('shows an error when the impact ratings cannot be loaded', async () => {
    const api = createMockItemApi()
    api.damageScenarios.impactRatings = () => Promise.reject(new Error('network'))
    renderApp(`${page}/impact`, api)

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
  })
})
