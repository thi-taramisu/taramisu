import { expect, test } from '@playwright/test'
import { stubItemsApi } from './support/itemsApi.ts'
import { stubProjectsApi } from './support/projectsApi.ts'

test('persists a real-project damage scenario and impact ratings across reloads, then deletes it', async ({ page }) => {
  await stubProjectsApi(page)
  await stubItemsApi(page)
  let scenario: Record<string, unknown> | undefined
  let ratings: Record<string, unknown>[] = []
  await page.route(
    /\/api\/v1\/item-definitions\/[^/]+\/(damage-scenarios|damage-scenario-asset-properties|threat-damage-links)(\/[^?]*)?(\?.*)?$/,
    async (route) => {
      const request = route.request()
      const parts = new URL(request.url()).pathname.split('/')
      const itemId = parts[4]
      if (parts[5] !== 'damage-scenarios') return route.fulfill({ json: [] })
      if (parts[7] === 'impact-ratings') {
        if (request.method() === 'POST') {
          const row = { ...request.postDataJSON(), id: crypto.randomUUID(), damage_scenario_id: scenario?.id }
          ratings.push(row)
          return route.fulfill({ status: 201, json: row })
        }
        if (request.method() === 'PUT') {
          const row = { ...request.postDataJSON(), id: parts[8], damage_scenario_id: scenario?.id }
          ratings = ratings.map((r) => (r.id === row.id ? row : r))
          return route.fulfill({ json: row })
        }
        return route.fulfill({ json: ratings })
      }
      if (request.method() === 'POST') {
        scenario = { ...request.postDataJSON(), id: crypto.randomUUID(), item_definition_id: itemId }
        return route.fulfill({ status: 201, json: scenario })
      }
      if (request.method() === 'PATCH') {
        Object.assign(scenario!, request.postDataJSON())
        return route.fulfill({ json: scenario })
      }
      if (request.method() === 'DELETE') {
        scenario = undefined
        return route.fulfill({ status: 204 })
      }
      return route.fulfill({ json: parts[6] ? scenario : scenario ? [scenario] : [] })
    },
  )
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Create Project', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Project name').fill('Battery integration')
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('link', { name: 'Battery integration', exact: true }).click()
  const tree = page.getByRole('navigation', { name: 'Project elements' })
  await tree.getByRole('button', { name: 'New' }).click()
  await page.getByRole('menuitem', { name: 'Item', exact: true }).click()
  await page.getByRole('dialog').getByLabel(/Name/).fill('Battery pack')
  await page.getByRole('dialog').getByRole('button', { name: 'Create & open' }).click()
  await expect(page.getByRole('heading', { name: 'Battery pack' })).toBeVisible()
  await tree.getByRole('button', { name: 'New' }).click()
  await page.getByRole('menuitem', { name: 'Damage Scenario', exact: true }).click()
  await page.getByRole('dialog').getByLabel(/Name/).fill('Thermal runaway')
  await page.getByRole('dialog').getByRole('button', { name: 'Create & open' }).click()
  await expect(page.getByRole('heading', { name: 'Thermal runaway', exact: true })).toBeVisible()
  await page.getByLabel('Harm To Road User').fill('Burn injuries')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Harm To Road User')).toHaveValue('Burn injuries')
  await page.getByRole('link', { name: 'Impact', exact: true }).click()
  await page.getByRole('radiogroup', { name: 'Safety', exact: true }).getByText('Severe', { exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('radiogroup', { name: 'Safety', exact: true }).getByRole('radio', { name: /Severe/ }),
  ).toBeChecked()
  await page.getByRole('button', { name: 'Delete damage scenario', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete damage scenario' }).click()
  await expect(page.getByRole('heading', { name: 'Battery pack', exact: true })).toBeVisible()
  await expect(tree.getByRole('link', { name: 'Thermal runaway' })).toHaveCount(0)
})
