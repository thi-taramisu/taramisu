/// <reference lib="dom" />
import { expect, test } from '@playwright/test'

test.skip(!process.env.AUTHENTIK_THEME_TEST_URL, 'Requires a provisioned Authentik stack')
const loginPath = '/auth/if/flow/default-authentication-flow/'

test('an open login and a new enrollment form follow the frontend appearance', async ({ page, context }) => {
  const login = await context.newPage()
  await login.goto(loginPath)
  const button = login.getByRole('button', { name: 'Log in', exact: true })
  await expect(button).toBeVisible()

  await page.goto('/projects')
  await page.getByRole('button', { name: 'Dark mode' }).click()
  await page.goto('/design-system/colors')
  await page.getByRole('combobox', { name: 'Colour scheme' }).selectOption('ocean')
  const primary = await page.getByRole('link', { name: 'Compare all', exact: true })
    .evaluate(el => getComputedStyle(el).backgroundColor)
  await expect(login.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(button).toHaveCSS('background-color', primary)

  await page.goto('/auth/if/flow/taramisu-enrollment/')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCSS('background-color', primary)
})

test('mobile login stays usable when saved preferences are unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('taramisu.')) throw new Error('Storage unavailable')
      return getItem.call(this, key)
    }
  })
  await page.goto(loginPath)
  const input = page.getByRole('textbox', { name: 'Email or Username' })
  await input.fill('theme-preview')
  await expect(input).toHaveValue('theme-preview')
  const button = page.getByRole('button', { name: 'Log in', exact: true })
  await expect(button).toBeInViewport({ ratio: 1 })
  await expect(button).toHaveCSS('font-family', /Geist Variable/)
  expect(await page.evaluate(async () => {
    const faces = await document.fonts.load('16px "Geist Variable"', 'Sign in')
    return faces.length > 0 && document.documentElement.scrollWidth <= window.innerWidth
  })).toBe(true)
})
