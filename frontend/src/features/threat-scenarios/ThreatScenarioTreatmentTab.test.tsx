import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { createApiClient } from '@/api/client'
import { createItemApi } from '@/api/items'
import { createMockItemApi } from '@/api/mocks/mockItemApi'
import { createMockProjectApi } from '@/api/mocks/mockProjectApi'
import type { ItemDefinition } from '@/api/models/item'
import type { Project, ProjectRole } from '@/api/models/project'
import type { TreatmentDecision, TreatmentDecisionBody } from '@/api/treatmentDecisions'
import { renderApp } from '@/test/renderApp'

const baseUrl = 'http://api.test'
const projectId = '50000000-0000-4000-8000-000000000001'
const itemId = '50000000-0000-4000-8000-000000000002'
const scenarioId = '50000000-0000-4000-8000-000000000003'
const riskId = '50000000-0000-4000-8000-000000000004'
const item: ItemDefinition = {
  id: itemId, display_id: 'IT-1', tara_project_id: projectId, name: 'Controller', scope_type: 'ITEM',
  created_at: '2026-11-28T12:00:00Z',
}
const scenario = { id: scenarioId, item_definition_id: itemId, display_id: 'TS-1', title: 'Incorrect configuration' }
const decisionsUrl = `${baseUrl}/api/v1/threat-scenarios/${scenarioId}/risk-treatment-decisions`
const server = setupServer(
  http.get(`${baseUrl}/api/v1/projects/${projectId}/item-definitions`, () => HttpResponse.json([item])),
  http.get(`${baseUrl}/api/v1/item-definitions/${itemId}/threat-scenarios`, () => HttpResponse.json([scenario])),
  http.get(`${baseUrl}/api/v1/item-definitions/${itemId}/threat-scenarios/${scenarioId}`, () => HttpResponse.json(scenario)),
  http.get(`${baseUrl}/api/v1/threat-scenarios/${scenarioId}/risk-values`, () =>
    HttpResponse.json([{ id: riskId, threat_scenario_id: scenarioId, risk_score: 3, determination_method: 'RISK_MATRIX' }]),
  ),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderProject(role: ProjectRole, archived = false, path = `/threat-scenarios/${scenarioId}/treatment`) {
  const project: Project = {
    id: projectId, name: 'Controls', description: '', role, archived,
    favorite: false, owner: 'Owner', updatedAt: item.created_at,
  }
  const projects = createMockProjectApi([project])
  const mocks = createMockItemApi(projects)
  return renderApp(`/projects/${projectId}${path}`, {
    ...mocks, ...createItemApi(createApiClient({ baseUrl }), mocks),
  })
}

it('creates, edits and deletes a decision for a backend scenario', async () => {
  let saved: TreatmentDecision | undefined
  const decisionId = '50000000-0000-4000-8000-000000000005'
  server.use(
    http.get(decisionsUrl, () => HttpResponse.json(saved ? [saved] : [])),
    http.post(decisionsUrl, async ({ request }) => {
      const body = await request.json() as TreatmentDecisionBody
      saved = { id: decisionId, threat_scenario_id: scenarioId, ...body }
      return HttpResponse.json(saved, { status: 201 })
    }),
    http.patch(`${decisionsUrl}/${decisionId}`, async ({ request }) => {
      const body = await request.json() as TreatmentDecisionBody
      saved = { id: decisionId, threat_scenario_id: scenarioId, ...body }
      return HttpResponse.json(saved)
    }),
    http.delete(`${decisionsUrl}/${decisionId}`, () => {
      saved = undefined
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderProject('EDITOR')
  expect(await screen.findByRole('heading', { name: 'Risk treatment decisions' })).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: 'Add decision' }))
  await user.selectOptions(screen.getByLabelText('Treatment option'), 'RETAINING')
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await user.click(screen.getByRole('checkbox', { name: 'Cybersecurity claim' }))
  await user.selectOptions(screen.getByLabelText('Risk value'), riskId)
  await user.type(screen.getByLabelText('Decision rationale'), 'Acceptance documented')
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Acceptance documented')).toBeInTheDocument()
  expect(saved).toMatchObject({ risk_value_id: riskId, treatment_option: 'RETAINING', is_cybersecurity_claim: true })
  await user.click(screen.getByRole('button', { name: 'Edit' }))
  await user.selectOptions(screen.getByLabelText('Risk value'), '')
  await user.clear(screen.getByLabelText('Decision rationale'))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.queryByText('Acceptance documented')).toBeNull())
  expect(saved).toMatchObject({ risk_value_id: null, decision_rationale: null })

  await user.click(screen.getByRole('button', { name: 'Delete' }))
  const dialog = await screen.findByRole('alertdialog')
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
  expect(await screen.findByText('No treatment decisions yet.')).toBeInTheDocument()
})

it.each<[ProjectRole, boolean]>([['VIEWER', false], ['OWNER', true]])(
  'shows decisions without editing controls for role %s and archived=%s',
  async (role, archived) => {
    server.use(http.get(decisionsUrl, () => HttpResponse.json([{
      id: 'decision-id', threat_scenario_id: scenarioId, treatment_option: 'REDUCING', decision_rationale: 'Limit the exposure',
    }])))
    renderProject(role, archived)
    expect(await screen.findByText('Limit the exposure')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add decision' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  },
)

it('creates, edits and deletes a threat scenario through the workspace', async () => {
  const threats = `${baseUrl}/api/v1/item-definitions/${itemId}/threat-scenarios`
  let record: typeof scenario | undefined
  server.use(
    http.get(threats, () => HttpResponse.json(record ? [record] : [])),
    http.post(threats, async ({ request }) => {
      const body = await request.json() as Pick<typeof scenario, 'title'>
      record = { ...scenario, ...body }
      return HttpResponse.json(record, { status: 201 })
    }),
    http.get(`${threats}/${scenarioId}`, () => HttpResponse.json(record)),
    http.patch(`${threats}/${scenarioId}`, async ({ request }) => {
      const body = await request.json() as Pick<typeof scenario, 'title'>
      record = { ...scenario, ...body }
      return HttpResponse.json(record)
    }),
    http.delete(`${threats}/${scenarioId}`, () => {
      record = undefined
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${baseUrl}/api/v1/projects/${projectId}/item-definitions/${itemId}`, () => HttpResponse.json(item)),
  )
  const { user } = renderProject('OWNER', false, '')
  await user.click(await screen.findByRole('button', { name: 'New' }))
  await user.click(screen.getByRole('menuitem', { name: 'Threat Scenario' }))
  const dialog = await screen.findByRole('dialog', { name: 'New Threat Scenario' })
  await user.type(within(dialog).getByLabelText(/Name/), 'Incorrect configuration')
  await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))
  expect(await screen.findByRole('heading', { name: /Incorrect configuration, Threat Scenario/ })).toBeInTheDocument()

  const name = screen.getByLabelText(/Name/)
  await user.clear(name)
  await user.type(name, 'Unexpected settings')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('heading', { name: /Unexpected settings, Threat Scenario/ })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Delete threat scenario' }))
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/projects/${projectId}/items/${itemId}`))
  expect(record).toBeUndefined()
})
