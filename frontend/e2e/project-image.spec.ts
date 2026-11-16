import { expect, test } from '@playwright/test'

const image = {
  name: 'project.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=', 'base64'),
}

test('project image survives dialog close, favoriting, archive and restore', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Create Project', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Project name').fill('Image project')
  await dialog.getByLabel('Image', { exact: true }).setInputFiles(image)
  await expect(dialog.getByAltText('Preview')).toBeVisible()
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()

  const all = page.locator('section').filter({ has: page.getByRole('heading', { name: 'All Projects', exact: true }) })
  const row = all.locator('[data-slot="card"]').filter({ hasText: 'Image project' })
  await expect(row.locator('img')).toBeVisible()
  await expect.poll(() => row.locator('img').evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth)).toBeGreaterThan(0)
  const source = await row.locator('img').getAttribute('src')
  await row.getByRole('button', { name: 'Add Image project to favorites' }).click()
  const favorites = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Favorites', exact: true }) })
  const favoriteImage = favorites.locator('[data-slot="card"]').filter({ hasText: 'Image project' }).locator('img')
  await expect(favoriteImage).toHaveAttribute('src', source!)
  await row.getByRole('button', { name: 'Actions for Image project' }).click()
  await page.getByRole('menuitem', { name: 'Archive Project' }).click()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.locator('main img')).toHaveAttribute('src', source!)
  await page.getByRole('button', { name: 'Restore Image project' }).click()
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(row.locator('img')).toHaveAttribute('src', source!)
  await expect(favoriteImage).toHaveAttribute('src', source!)

  await page.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(dialog.getByAltText('Preview')).toHaveCount(0)
  await dialog.getByLabel('Image', { exact: true }).setInputFiles(image)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(dialog.getByAltText('Preview')).toHaveCount(0)
})

test('renders the same generated image in the list and favorites', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Create Project', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Project name').fill('Generated cover')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()

  const all = page.locator('section').filter({ has: page.getByRole('heading', { name: 'All Projects', exact: true }) })
  const row = all.locator('[data-slot="card"]').filter({ hasText: 'Generated cover' })
  const generated = row.locator('img')
  await expect(generated).toHaveAttribute('alt', '')
  await expect(generated).toHaveAttribute('src', /^data:image\/svg\+xml[;,]/)
  await expect.poll(() => generated.evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth)).toBeGreaterThan(0)
  const source = await generated.getAttribute('src')

  await row.getByRole('button', { name: 'Add Generated cover to favorites' }).click()
  const favorites = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Favorites', exact: true }) })
  const favorite = favorites.locator('[data-slot="card"]').filter({ hasText: 'Generated cover' })
  await expect(favorite.locator('img')).toHaveAttribute('src', source!)
})
