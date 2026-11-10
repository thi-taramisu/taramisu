import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/errors'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'
const risks = `${project}/threat-scenarios/ts-01/risks`
const DS01 = 'DS-01 Headlamp turns off while driving at night'

const overview = () => within(screen.getByRole('region', { name: 'Risk overview' }))
const damageScenario = (name: string) => within(screen.getByRole('region', { name }))
const findDamageScenario = async (name: string) => within(await screen.findByRole('region', { name }))
const notes = () => within(screen.getByRole('list', { name: 'Notes on the risk values' }))
const main = () => within(screen.getByRole('main'))
const valueOf = (term: string) => overview().getByText(term).nextSibling

describe('threat scenario risks', () => {
  it('shows the attack feasibility and the highest risk once for the threat scenario', async () => {
    renderApp(risks)

    await screen.findByRole('region', { name: 'Risk overview' })
    expect(valueOf('Attack Feasibility')).toHaveTextContent(/^Medium\s*via AP-02$/)
    expect(overview().getByRole('link', { name: 'via AP-02' })).toHaveAttribute('href', `${project}/attack-paths/ap-02/rating`)
    expect(valueOf('Highest Risk')).toHaveTextContent(/^Risk 4\s*in DS-01 · Safety$/)
    expect(screen.queryByRole('list', { name: 'Notes on the risk values' })).not.toBeInTheDocument()
  })

  it('lists the rated categories per damage scenario and the others in one line', async () => {
    renderApp(risks)

    const block = await findDamageScenario(DS01)
    expect(block.getByText('Max')).toHaveTextContent('Max Risk 4')
    expect(block.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^SafetySevere impactMedium feasibilityRisk 4Highest/),
      expect.stringMatching(/^OperationalModerate impactMedium feasibilityRisk 2(?!Highest)/),
      'FinancialNot rated',
    ])
    const privacy = block.getByText('Privacy')
    expect(privacy).toHaveAttribute('title', 'No personal data is involved.')
    expect(privacy.parentElement).toHaveTextContent(/^OmittedPrivacy/)
    expect(block.getAllByRole('link', { name: 'Severe impact' })[0]).toHaveAttribute('href', `${project}/damage-scenarios/ds-01/impact`)
    expect(block.getAllByRole('link', { name: 'Medium feasibility' })[0]).toHaveAttribute('href', `${project}/attack-paths/ap-02/rating`)
    expect(block.getByText(/^via/)).toHaveTextContent('via A-01 Headlamp on/off command · Integrity')
    expect(block.getByRole('link', { name: 'Not rated' })).toHaveAttribute('href', `${project}/damage-scenarios/ds-01/impact`)
    expect(block.queryByText('No target')).not.toBeInTheDocument()
  })

  it('marks every row with the highest risk of the threat scenario', async () => {
    const api = createMockItemApi()
    const ds = await api.damageScenarios.create('headlamp', { item_definition_id: 'i-01', title: 'Glare', asset_properties: [{ asset_id: 'a-01', property: 'I' }] })
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-01', ds.id)
    await api.damageScenarios.updateImpactRatings('headlamp', ds.id, [
      { impact_category: 'FINANCIAL', rating_value: 'SEVERE', is_omitted_by_pm_15_07: false, omission_or_rating_rationale: null, reused_from_functional_safety: false },
    ])
    renderApp(risks, api)

    await findDamageScenario(DS01)
    expect(damageScenario(DS01).getAllByText('Highest')).toHaveLength(1)
    expect(damageScenario(`${ds.code} Glare`).getAllByRole('listitem')[0]).toHaveTextContent(/^FinancialSevere impactMedium feasibilityRisk 4Highest/)
  })

  it('shows the calculation with the risk matrix only on request', async () => {
    const { user } = renderApp(risks)
    const block = await findDamageScenario(DS01)
    expect(screen.queryByRole('table', { name: /Risk matrix/ })).not.toBeInTheDocument()

    await user.click(block.getByRole('button', { name: 'DS-01 Safety Calculation' }))

    const matrix = screen.getByRole('table', { name: /Risk matrix/ })
    expect(within(matrix).getByText('(this risk value)').parentElement).toHaveTextContent('4')
    expect(block.getByRole('button', { name: 'DS-01 Safety Calculation' })).toHaveAttribute('aria-expanded', 'true')
    expect(block.getByText(/the most feasible of 2 rated attack paths/)).toBeInTheDocument()

    // Only one calculation is open at a time.
    await user.click(block.getByRole('button', { name: 'DS-01 Operational Calculation' }))
    expect(screen.getAllByRole('table', { name: /Risk matrix/ })).toHaveLength(1)
    expect(block.getByRole('button', { name: 'DS-01 Safety Calculation' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(screen.getByRole('table', { name: /Risk matrix/ })).getByText('(this risk value)').parentElement).toHaveTextContent('2')

    await user.click(block.getByRole('button', { name: 'DS-01 Operational Calculation' }))
    expect(screen.queryByRole('table', { name: /Risk matrix/ })).not.toBeInTheDocument()
  })

  it('follows a changed attack path rating', async () => {
    const api = createMockItemApi()
    await api.attackPaths.updateRating('headlamp', 'ap-01', {
      ap_elapsed_time: 1,
      ap_specialist_expertise: 0,
      ap_knowledge_of_item: 0,
      ap_window_of_opportunity: 0,
      ap_equipment: 0,
      ap_total_score: 1,
      feasibility_rating: 'HIGH',
      rationale: null,
    })
    renderApp(risks, api)

    await screen.findByRole('region', { name: 'Risk overview' })
    expect(valueOf('Attack Feasibility')).toHaveTextContent(/^High\s*via AP-01$/)
    expect(damageScenario(DS01).getAllByRole('listitem')[0]).toHaveTextContent(/^SafetySevere impactHigh feasibilityRisk 5/)
  })

  it('separates several damage scenarios', async () => {
    const api = createMockItemApi()
    const ds = await api.damageScenarios.create('headlamp', { item_definition_id: 'i-01', title: 'Glare', asset_properties: [{ asset_id: 'a-03', property: 'I' }] })
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-01', ds.id)
    renderApp(risks, api)

    await findDamageScenario(DS01)
    const second = damageScenario(`${ds.code} Glare`)
    expect(second.getByText('No target')).toBeInTheDocument()
    expect(second.getAllByRole('link', { name: 'Not rated' })).toHaveLength(4)
  })

  it('flags unrated attack paths and a partial decisive path', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.linkAttackPath('headlamp', 'ts-01', 'ap-03')
    await api.attackPaths.update('headlamp', 'ap-02', { is_partial_early_stage: true })
    renderApp(risks, api)

    await screen.findByRole('region', { name: 'Risk overview' })
    expect(notes().getByText(/is not rated yet and can raise the feasibility/)).toBeInTheDocument()
    expect(notes().getByRole('link', { name: /AP-03/ })).toHaveAttribute('href', `${project}/attack-paths/ap-03/rating`)
    expect(notes().getByText(/is a partial attack path, so the feasibility can still change/)).toBeInTheDocument()
  })

  it('flags a damage scenario that none of the targets leads to', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.setTargets('headlamp', 'ts-01', [])
    renderApp(risks, api)

    const badge = (await findDamageScenario(DS01)).getByText('No target')
    expect(badge.closest('a')).toHaveAttribute('href', `${project}/threat-scenarios/ts-01`)
  })

  it('has no highest risk while no impact is rated', async () => {
    const api = createMockItemApi()
    const ds = await api.damageScenarios.create('headlamp', { item_definition_id: 'i-01', title: 'Glare', asset_properties: [{ asset_id: 'a-03', property: 'I' }] })
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-02', ds.id)
    await api.threatScenarios.linkAttackPath('headlamp', 'ts-02', 'ap-01')
    renderApp(`${project}/threat-scenarios/ts-02/risks`, api)

    await screen.findByRole('region', { name: 'Risk overview' })
    expect(valueOf('Highest Risk')).toHaveTextContent('Not determined yet')
    expect(screen.queryByRole('button', { name: /Calculation/ })).not.toBeInTheDocument()
  })

  it('says that a damage scenario is missing and links to the Relations tab', async () => {
    renderApp(`${project}/threat-scenarios/ts-02/risks`)

    expect(await screen.findByText('No damage scenario is linked yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Link it on the Relations tab' })).toHaveAttribute('href', `${project}/threat-scenarios/ts-02/relations`)
  })

  it('says that an attack path is missing', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-02', 'ds-01')
    renderApp(`${project}/threat-scenarios/ts-02/risks`, api)

    expect(await screen.findByText('No attack path is linked yet.')).toBeInTheDocument()
  })

  it('links to the rating of unrated attack paths when none is rated', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-02', 'ds-01')
    await api.threatScenarios.linkAttackPath('headlamp', 'ts-02', 'ap-03')
    renderApp(`${project}/threat-scenarios/ts-02/risks`, api)

    expect(await screen.findByText('None of the linked attack paths is rated yet.')).toBeInTheDocument()
    expect(main().getByRole('link', { name: /AP-03/ })).toHaveAttribute('href', `${project}/attack-paths/ap-03/rating`)
  })

  it('shows an error when the risks cannot be loaded', async () => {
    const api = createMockItemApi()
    api.threatScenarios.riskInputs = () => Promise.reject(new ApiError(500, 'Server error'))
    renderApp(risks, api)

    expect(await screen.findByText('The risks could not be loaded.')).toBeInTheDocument()
  })

  it('shows a loading state until the risks arrive', async () => {
    const api = createMockItemApi()
    api.threatScenarios.riskInputs = () => new Promise(() => undefined)
    renderApp(risks, api)

    expect(await screen.findByText('Loading risks…')).toBeInTheDocument()
  })
})
