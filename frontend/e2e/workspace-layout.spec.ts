import { expect, test } from '@playwright/test'

test.describe('Workspace layout', () => {
  test('scrolls long pages inside the content area and not the whole window', async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 600 })
    await page.goto('/projects/headlamp/threat-scenarios/ts-01')
    await expect(page.getByRole('group', { name: 'Targeted Assets and Compromised Properties' })).toBeAttached()

    const { documentHeight, windowHeight, contentScrolls } = await page.locator('main').evaluate((main) => ({
      documentHeight: main.ownerDocument.documentElement.scrollHeight,
      windowHeight: main.ownerDocument.documentElement.clientHeight,
      contentScrolls: main.scrollHeight > main.clientHeight,
    }))

    expect(documentHeight).toBe(windowHeight)
    expect(contentScrolls).toBe(true)
  })
})
