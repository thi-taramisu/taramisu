import { formatEntityId } from '../workspace/entities'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/errors'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { renderApp } from '../../test/renderApp'

const project = '/projects/headlamp'
const risks = `${project}/threat-scenarios/ts-01/risks`
const DS01 = 'DS-1 Headlamp turns off while driving at night'

const overview = () => within(screen.getByRole('region', { name: 'Risk overview' }))
const damageScenario = (name: string) => within(screen.getByRole('region', { name }))
const findDamageScenario = async (name: string) => within(await screen.findByRole('region', { name }))
const notes = () => within(screen.getByRole('list', { name: 'Notes on the risk values' }))
const main = () => within(screen.getByRole('main'))
const valueOf = (term: string) => overview().getByText(term).nextSibling
/** The category rows of a damage scenario, without the column header row. */
const rowsOf = (block: Pick<typeof screen, 'getAllByRole'>) => block.getAllByRole('row').slice(1)

describe('threat scenario risks', () => {
  it('shows the attack feasibility and the highest risk once for the threat scenario', async () => {
    renderApp(risks)

    await screen.findByRole('region', { name: 'Risk overview' })
    expect(valueOf('Attack Feasibility')).toHaveTextContent(/^Medium\s*via AP-2$/)
    expect(overview().queryByRole('link')).not.toBeInTheDocument()
    expect(valueOf('Highest Risk')).toHaveTextContent(/^Risk 4\s*in DS-1 · Safety$/)
    expect(screen.queryByRole('list', { name: 'Notes on the risk values' })).not.toBeInTheDocument()
  })

  it('lists the rated categories per damage scenario and the others in one line', async () => {
    renderApp(risks)

    const block = await findDamageScenario(DS01)
    expect(block.getByText('max.')).toHaveTextContent(/^max\. Risk 4$/)
    expect(rowsOf(block).map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^SafetySevere impactMedium feasibility4Highest$/),
      expect.stringMatching(/^OperationalModerate impactMedium feasibility2$/),
      'FinancialNot rated',
    ])
    expect(block.getByText('Privacy').parentElement).toHaveTextContent(/^Omitted:Privacy$/)
    expect(block.queryByText('No personal data is involved.')).not.toBeInTheDocument()
    expect(block.getByRole('link', { name: 'Edit the Safety impact on the Impact tab of DS-1' })).toHaveAttribute('href', `${project}/damage-scenarios/ds-01/impact`)
    expect(block.getAllByRole('link', { name: 'Edit the rating of AP-2, the most feasible attack path' })[0]).toHaveAttribute('href', `${project}/attack-paths/ap-02/rating`)
    expect(block.getByRole('link', { name: 'Rate the Financial impact on the Impact tab of DS-1' })).toHaveAttribute('href', `${project}/damage-scenarios/ds-01/impact`)
    expect(block.queryByText(/None of the targets/)).not.toBeInTheDocument()
    expect(within(block.getByRole('heading', { name: DS01 })).queryByRole('link')).not.toBeInTheDocument()
  })

  it('announces the category and the column of each value', async () => {
    renderApp(risks)

    const table = within((await findDamageScenario(DS01)).getByRole('table', { name: 'Risk values per impact category' }))
    expect(table.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Category', 'Impact', 'Feasibility', 'Risk'])
    const safety = table.getByRole('rowheader', { name: 'Safety' }).closest('tr')!
    expect(within(safety).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Severe impact',
      'Medium feasibility',
      '4Highest',
    ])
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
    expect(rowsOf(damageScenario(`${formatEntityId(ds.code)} Glare`))[0]).toHaveTextContent(/^FinancialSevere impactMedium feasibility4Highest$/)
    expect(valueOf('Highest Risk')).toHaveTextContent(/^Risk 4\s*in DS-1 · Safety and 1 more$/)
  })

  it('marks no row as highest while all risk values are equal', async () => {
    const api = createMockItemApi()
    const ds = await api.damageScenarios.create('headlamp', { item_definition_id: 'i-01', title: 'Glare', asset_properties: [{ asset_id: 'a-03', property: 'I' }] })
    await api.damageScenarios.updateImpactRatings('headlamp', ds.id, [
      { impact_category: 'SAFETY', rating_value: 'MAJOR', is_omitted_by_pm_15_07: false, omission_or_rating_rationale: null, reused_from_functional_safety: false },
      { impact_category: 'FINANCIAL', rating_value: 'MAJOR', is_omitted_by_pm_15_07: false, omission_or_rating_rationale: null, reused_from_functional_safety: false },
    ])
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-02', ds.id)
    await api.threatScenarios.setTargets('headlamp', 'ts-02', [{ assetId: 'a-03', property: 'I' }])
    await api.threatScenarios.linkAttackPath('headlamp', 'ts-02', 'ap-01')
    renderApp(`${project}/threat-scenarios/ts-02/risks`, api)

    const block = await findDamageScenario(`${formatEntityId(ds.code)} Glare`)
    expect(block.getAllByRole('button', { name: /^Risk \d, calculation of/ })).toHaveLength(2)
    expect(block.queryByText('Highest')).not.toBeInTheDocument()
    expect(valueOf('Highest Risk')).toHaveTextContent(/and 1 more$/)
  })

  it('shows the calculation with the risk matrix in a popover of the risk value', async () => {
    const { user } = renderApp(risks)
    const block = await findDamageScenario(DS01)
    expect(screen.queryByRole('table', { name: /Risk matrix/ })).not.toBeInTheDocument()

    const safety = block.getByRole('button', { name: 'Risk 4, highest, calculation of DS-1 Safety' })
    expect(safety).toHaveTextContent(/^4$/)
    await user.click(safety)

    const popover = within(screen.getByRole('dialog', { name: 'Calculation of DS-1 Safety' }))
    expect(popover.getByText('Calculation')).toBeInTheDocument()
    const matrix = popover.getByRole('table', { name: /Risk matrix/ })
    expect(within(matrix).getByText('(this risk value)').parentElement).toHaveTextContent('4')
    expect(safety).toHaveAttribute('aria-expanded', 'true')
    expect(popover.queryByRole('link')).not.toBeInTheDocument()
    // Impact rises from the bottom: Severe is the lowest row.
    expect(within(matrix).getAllByRole('rowheader').map((header) => header.textContent)).toEqual(['Negligible', 'Moderate', 'Major', 'Severe'])

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(safety).toHaveFocus()

    await user.click(block.getByRole('button', { name: 'Risk 2, calculation of DS-1 Operational' }))
    expect(within(within(screen.getByRole('dialog')).getByRole('table', { name: /Risk matrix/ })).getByText('(this risk value)').parentElement).toHaveTextContent('2')
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
    expect(valueOf('Attack Feasibility')).toHaveTextContent(/^High\s*via AP-1$/)
    expect(rowsOf(damageScenario(DS01))[0]).toHaveTextContent(/^SafetySevere impactHigh feasibility5/)
  })

  it('separates several damage scenarios', async () => {
    const api = createMockItemApi()
    const ds = await api.damageScenarios.create('headlamp', { item_definition_id: 'i-01', title: 'Glare', asset_properties: [{ asset_id: 'a-03', property: 'I' }] })
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-01', ds.id)
    renderApp(risks, api)

    await findDamageScenario(DS01)
    const second = damageScenario(`${formatEntityId(ds.code)} Glare`)
    expect(second.getByText(/None of the targets of this threat scenario leads to this damage scenario/)).toBeInTheDocument()
    expect(second.getAllByRole('link', { name: /^Rate the / }).map((link) => link.getAttribute('aria-label'))).toEqual(
      ['Safety', 'Financial', 'Operational', 'Privacy'].map((category) => `Rate the ${category} impact on the Impact tab of ${formatEntityId(ds.code)}`),
    )
  })

  it('flags unrated attack paths and a partial decisive path', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.linkAttackPath('headlamp', 'ts-01', 'ap-03')
    await api.attackPaths.update('headlamp', 'ap-02', { is_partial_early_stage: true })
    renderApp(risks, api)

    await screen.findByRole('region', { name: 'Risk overview' })
    expect(notes().getByText(/is not rated yet and can raise the feasibility/)).toBeInTheDocument()
    expect(notes().getByRole('link', { name: /AP-3/ })).toHaveAttribute('href', `${project}/attack-paths/ap-03/rating`)
    expect(notes().getByText(/is a partial attack path, so the feasibility can still change/)).toBeInTheDocument()
  })

  it('lists no unrated attack path once the feasibility is High', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.linkAttackPath('headlamp', 'ts-01', 'ap-03')
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
    expect(valueOf('Attack Feasibility')).toHaveTextContent(/^High\s*via AP-1$/)
    expect(screen.queryByRole('list', { name: 'Notes on the risk values' })).not.toBeInTheDocument()
  })

  it('flags a damage scenario that none of the targets leads to', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.setTargets('headlamp', 'ts-01', [])
    renderApp(risks, api)

    const block = await findDamageScenario(DS01)
    expect(block.getByRole('link', { name: 'Check the targets' })).toHaveAttribute('href', `${project}/threat-scenarios/ts-01`)
    expect(block.getByText(/so its risk values do not count for the threat scenario/)).toBeInTheDocument()
    // Its values stay visible, but neither raise nor mark the highest risk of the threat scenario.
    expect(block.getByRole('button', { name: 'Risk 4, calculation of DS-1 Safety' })).toBeInTheDocument()
    expect(block.queryByText('Highest')).not.toBeInTheDocument()
    expect(valueOf('Highest Risk')).toHaveTextContent('Not determined yet')
  })

  it('has no highest risk while no impact is rated', async () => {
    const api = createMockItemApi()
    const ds = await api.damageScenarios.create('headlamp', { item_definition_id: 'i-01', title: 'Glare', asset_properties: [{ asset_id: 'a-03', property: 'I' }] })
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-02', ds.id)
    await api.threatScenarios.linkAttackPath('headlamp', 'ts-02', 'ap-01')
    renderApp(`${project}/threat-scenarios/ts-02/risks`, api)

    await screen.findByRole('region', { name: 'Risk overview' })
    expect(valueOf('Highest Risk')).toHaveTextContent('Not determined yet')
    expect(screen.queryByRole('button', { name: /calculation of/ })).not.toBeInTheDocument()
  })

  it('says that both a damage scenario and an attack path are missing and links to the Relations tab', async () => {
    renderApp(`${project}/threat-scenarios/ts-02/risks`)

    const missing = within(await screen.findByRole('list', { name: 'Missing for risk values' }))
    expect(missing.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['No damage scenario is linked yet.', 'No attack path is linked yet.'])
    expect(screen.getByRole('link', { name: 'Link them on the Relations tab' })).toHaveAttribute('href', `${project}/threat-scenarios/ts-02/relations`)
  })

  it('says that an attack path is missing', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-02', 'ds-01')
    renderApp(`${project}/threat-scenarios/ts-02/risks`, api)

    expect(await screen.findByText('No attack path is linked yet.')).toBeInTheDocument()
    expect(screen.queryByText('No damage scenario is linked yet.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Link it on the Relations tab' })).toBeInTheDocument()
  })

  it('asks for a damage scenario and a rating at the same time', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.linkAttackPath('headlamp', 'ts-02', 'ap-03')
    renderApp(`${project}/threat-scenarios/ts-02/risks`, api)

    expect(await screen.findByText('No damage scenario is linked yet.')).toBeInTheDocument()
    expect(screen.getByText('None of the linked attack paths is rated yet.')).toBeInTheDocument()
    expect(main().getByRole('link', { name: /AP-3/ })).toHaveAttribute('href', `${project}/attack-paths/ap-03/rating`)
    expect(screen.getByRole('link', { name: 'Link it on the Relations tab' })).toBeInTheDocument()
  })

  it('links to the rating of unrated attack paths when none is rated', async () => {
    const api = createMockItemApi()
    await api.threatScenarios.linkDamageScenario('headlamp', 'ts-02', 'ds-01')
    await api.threatScenarios.linkAttackPath('headlamp', 'ts-02', 'ap-03')
    renderApp(`${project}/threat-scenarios/ts-02/risks`, api)

    expect(await screen.findByText('None of the linked attack paths is rated yet.')).toBeInTheDocument()
    expect(main().getByRole('link', { name: /AP-3/ })).toHaveAttribute('href', `${project}/attack-paths/ap-03/rating`)
  })

  it('shows an error when the risks cannot be loaded', async () => {
    const api = createMockItemApi()
    api.threatScenarios.risks = () => Promise.reject(new ApiError(500, 'Server error'))
    renderApp(risks, api)

    expect(await screen.findByText('The risks could not be loaded.')).toBeInTheDocument()
  })

  it('shows a loading state until the risks arrive', async () => {
    const api = createMockItemApi()
    api.threatScenarios.risks = () => new Promise(() => undefined)
    renderApp(risks, api)

    expect(await screen.findByText('Loading risks…')).toBeInTheDocument()
  })
})
