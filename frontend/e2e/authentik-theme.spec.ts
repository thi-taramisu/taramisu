/// <reference lib="dom" />
import { expect, test } from '@playwright/test'

// Opt in against an isolated, provisioned stack with both apps behind the same origin.
const origin = process.env.AUTHENTIK_THEME_TEST_URL
const loginPath = '/auth/if/flow/default-authentication-flow/'
test.skip(!origin, 'Requires AUTHENTIK_THEME_TEST_URL and a running Authentik stack')

test('frontend choices reach open login pages and new registration pages for every palette/mode', async ({ page, context }) => {
  const login = await context.newPage()
  await login.goto(`${origin}${loginPath}`)
  const loginButton = login.getByRole('button', { name: 'Log in', exact: true })
  await expect(loginButton).toBeVisible()

  for (const scheme of ['neutral', 'ocean', 'iris']) {
    for (const mode of ['light', 'dark']) {
      await page.goto(`${origin}/projects`)
      const toggle = page.getByRole('button', { name: 'Dark mode' })
      if ((await toggle.getAttribute('aria-pressed') === 'true') !== (mode === 'dark')) await toggle.click()
      await page.goto(`${origin}/design-system/colors`)
      await page.getByRole('combobox', { name: 'Colour scheme' }).selectOption(scheme)
      const colour = await page.getByRole('link', { name: 'Compare all', exact: true })
        .evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor)
      await expect(login.locator('html')).toHaveAttribute('data-color-scheme', scheme)
      await expect(login.locator('html')).toHaveAttribute('data-theme', mode)
      await expect(loginButton).toHaveCSS('background-color', colour)
      // Changing the system preference must not override the explicit app choice.
      await login.emulateMedia({ colorScheme: mode === 'dark' ? 'light' : 'dark' })
      await expect(loginButton).toHaveCSS('background-color', colour)
    }
  }

  await login.reload()
  await expect(login.locator('html')).toHaveAttribute('data-color-scheme', 'iris')
  await expect(login.locator('html')).toHaveAttribute('data-theme', 'dark')
  const colour = await loginButton.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor)
  const registration = await context.newPage()
  await registration.goto(`${origin}/auth/if/flow/taramisu-enrollment/`)
  await expect(registration.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(registration.getByRole('button', { name: 'Continue', exact: true })).toHaveCSS('background-color', colour)
  await registration.close()
  await login.close()
})

test('invalid preferences and cross-tab removal reset flows to the app defaults', async ({ page, context }) => {
  await page.goto(`${origin}/projects`)
  await page.evaluate(() => {
    localStorage.setItem('taramisu.theme', 'invalid')
    localStorage.setItem('taramisu.colorScheme', 'invalid')
  })
  const login = await context.newPage()
  await login.emulateMedia({ colorScheme: 'dark' })
  await login.goto(`${origin}${loginPath}`)
  await expect(login.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(login.locator('html')).toHaveAttribute('data-color-scheme', 'neutral')
  await page.evaluate(() => {
    localStorage.setItem('taramisu.theme', 'dark')
    localStorage.setItem('taramisu.colorScheme', 'ocean')
  })
  await expect(login.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(login.locator('html')).toHaveAttribute('data-color-scheme', 'ocean')
  await page.evaluate(() => localStorage.clear())
  await expect(login.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(login.locator('html')).toHaveAttribute('data-color-scheme', 'neutral')
  await login.close()
})

test('unreadable app preferences leave the login form usable with light Neutral', async ({ page }) => {
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('taramisu.')) throw new Error('App preferences unavailable')
      return getItem.call(this, key)
    }
  })
  await page.goto(`${origin}${loginPath}`)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'neutral')
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Email or Username' }).fill('theme-preview')
  await expect(page.getByRole('textbox', { name: 'Email or Username' })).toHaveValue('theme-preview')
})

for (const width of [320, 1280]) {
  test(`login controls fit and use the shared typeface at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`${origin}${loginPath}`)
    const input = page.getByRole('textbox', { name: 'Email or Username' })
    const button = page.getByRole('button', { name: 'Log in', exact: true })
    for (const control of [input, button]) {
      await expect(control).toBeInViewport({ ratio: 1 })
      await expect(control).toHaveCSS('font-family', /Geist Variable/)
    }
    await input.fill('theme-preview')
    await expect(input).toHaveValue('theme-preview')
    await button.focus()
    await expect(button).toBeFocused()
    expect(await page.evaluate(async () => {
      const faces = await document.fonts.load('16px "Geist Variable"', 'Sign in')
      return faces.length > 0 && document.documentElement.scrollWidth <= window.innerWidth
    })).toBe(true)
  })
}
