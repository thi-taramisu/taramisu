import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { createMockItemApi } from '../../api/mocks/mockItemApi'

const project = '/projects/headlamp'
const page = `${project}/damage-scenarios/ds-01`

const tree = () => screen.getByRole('navigation', { name: 'Project elements' })
const categoryRow = (name: string) => screen.getByRole('rowheader', { name }).closest('tr')!

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
    expect(within(tree()).getByRole('link', { name: /DS-01 Low beam fails at night/ })).toBeInTheDocument()
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
  it('shows the stored rating per category, with the rating as text', async () => {
    renderApp(`${page}/impact`)

    const safety = within((await screen.findByRole('rowheader', { name: 'Safety' })).closest('tr')!)
    expect(safety.getByRole('radio', { name: 'Safety Severe' })).toBeChecked()
    expect(safety.getByText('Severe', { selector: 'span' })).toBeInTheDocument()
    expect(within(categoryRow('Operational')).getByRole('radio', { name: 'Operational Moderate' })).toBeChecked()
    expect(within(categoryRow('Privacy')).getByRole('radio', { name: 'Privacy Omitted' })).toBeChecked()
    expect(within(categoryRow('Privacy')).getByText('Omitted', { selector: 'span:not(.sr-only)' })).toBeInTheDocument()
    expect(within(categoryRow('Financial')).getByText('Not rated')).toBeInTheDocument()
    expect(within(categoryRow('Financial')).queryByRole('radio', { checked: true })).not.toBeInTheDocument()
  })

  it('hides the rationale until it is opened', async () => {
    const { user } = renderApp(`${page}/impact`)

    const toggle = await screen.findByRole('button', { name: 'Expand Safety rationale' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAccessibleName('Collapse Safety rationale')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('textbox', { name: 'Safety rationale' })).toHaveValue('Severity S3 from the HARA of the headlamp system.')
  })

  it('opens the rationale when a category is omitted', async () => {
    const { user } = renderApp(`${page}/impact`)

    await user.click(await screen.findByRole('radio', { name: 'Financial Omitted' }))

    expect(screen.getByRole('textbox', { name: 'Financial rationale' })).toHaveAttribute('placeholder', expect.stringContaining('omitted'))
  })

  it('rates and omits categories and saves them', async () => {
    const { user, api } = renderApp(`${page}/impact`)

    await user.click(await screen.findByRole('radio', { name: 'Financial Major' }))
    expect(within(categoryRow('Financial')).getByText('Major', { selector: 'span:not(.sr-only)' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand Financial rationale' }))
    await user.type(screen.getByRole('textbox', { name: 'Financial rationale' }), 'Recall of the vehicle series')
    await user.click(screen.getByRole('radio', { name: 'Operational Omitted' }))
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

  it('shows an error and keeps the ratings when saving fails', async () => {
    const api = createMockItemApi()
    api.damageScenarios.updateImpactRatings = () => Promise.reject(new Error('network'))
    const { user } = renderApp(`${page}/impact`, api)

    await user.click(await screen.findByRole('radio', { name: 'Financial Negligible' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(screen.getByRole('radio', { name: 'Financial Negligible' })).toBeChecked()
  })

  it('shows an error when the impact ratings cannot be loaded', async () => {
    const api = createMockItemApi()
    api.damageScenarios.impactRatings = () => Promise.reject(new Error('network'))
    renderApp(`${page}/impact`, api)

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
  })
})
