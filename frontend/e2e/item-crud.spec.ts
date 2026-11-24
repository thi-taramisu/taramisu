import { expect, test } from '@playwright/test'
import { stubItemsApi } from './support/itemsApi.ts'
import { stubProjectsApi } from './support/projectsApi.ts'

test('creates, edits and deletes an item of a project from the backend', async ({ page }) => {
  await stubProjectsApi(page)
  await stubItemsApi(page)
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Create Project', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Project name').fill('Brake system')
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('link', { name: 'Brake system', exact: true }).click()

  const tree = page.getByRole('navigation', { name: 'Project elements' })
  await tree.getByRole('button', { name: 'New' }).click()
  await expect(page.getByRole('menuitem')).toHaveText(['Item'])
  await page.getByRole('menuitem', { name: 'Item' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Item' })
  await dialog.getByLabel(/Name/).fill('Brake controller')
  await dialog.getByRole('button', { name: 'Create & open' }).click()
  await expect(page.getByRole('heading', { name: 'Brake controller' })).toBeVisible()
  await expect(tree.getByRole('link', { name: 'Brake controller' })).toBeVisible()

  await page.getByLabel(/Boundary/).fill('Brake ECU and its CAN interface')
  await page.getByLabel(/Functions/).fill('Braking on driver request')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  // The values come back from the (stubbed) backend after a reload.
  await page.reload()
  await expect(page.getByLabel(/Boundary/)).toHaveValue('Brake ECU and its CAN interface')
  await expect(page.getByLabel(/Functions/)).toHaveValue('Braking on driver request')
  await page.getByRole('link', { name: 'Assets' }).click()
  await expect(page.getByText('Assets: not implemented yet')).toBeVisible()

  await page.getByRole('button', { name: 'Delete item' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete item' }).click()
  await expect(tree.getByRole('link', { name: 'Brake controller' })).toHaveCount(0)
})
