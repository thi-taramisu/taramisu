import { expect, test } from '@playwright/test'
import { stubProjectsApi } from './support/projectsApi.ts'

test('creates, renames and deletes a project', async ({ page }) => {
  await stubProjectsApi(page)
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Create Project', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Project name').fill('Brake system')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()

  await page.getByRole('link', { name: 'Brake system settings' }).click()
  await expect(page.getByRole('banner')).toContainText('Brake system')
  await page.getByLabel('Name').fill('Brake controller')
  await page.getByLabel('Description').fill('TARA of the brake controller')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await expect(page.getByRole('banner')).toContainText('Brake controller')

  await page.getByRole('link', { name: '← Back' }).click()
  const row = page.getByRole('link', { name: 'Brake controller settings' })
  await expect(row).toContainText('TARA of the brake controller')

  await page.getByRole('button', { name: 'Actions for Brake controller' }).click()
  await page.getByRole('menuitem', { name: 'Delete Project' }).click()
  const confirm = page.getByRole('alertdialog')
  await confirm.getByRole('button', { name: 'Delete Project' }).click()
  await confirm.getByRole('textbox').fill('Brake controller')
  await confirm.getByRole('button', { name: 'Delete Project' }).click()
  await expect(row).toHaveCount(0)
})
