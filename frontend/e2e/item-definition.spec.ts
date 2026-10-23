import { expect, test } from '@playwright/test'

test.describe('Item Definition page', () => {
  test('renders the headlamp React Flow diagram with nodes, edges, and controls', async ({ page }) => {
    await page.goto('/projects/headlamp/items/i-01')

    await expect(
      page.getByRole('heading', { name: /I-01 Headlamp system/i }),
    ).toBeVisible()

    // Verify React Flow canvas & boundary groups render with non-zero bounding boxes in a real browser
    await expect(page.getByText('Operational environment')).toBeVisible()
    await expect(page.getByText('Item boundary: Headlamp system')).toBeVisible()
    await expect(page.getByText('Gateway ECU')).toBeVisible()
    await expect(page.getByText('Body control ECU')).toBeVisible()
    await expect(page.getByText('Power switch actuator')).toBeVisible()

    // Verify SVG edges and React Flow controls are mounted
    await expect(page.locator('.react-flow__edge').first()).toBeAttached()
    await expect(page.locator('.react-flow__controls')).toBeVisible()
  })

  test('returns a not-found page for unknown routes', async ({ page }) => {
    await page.goto('/unknown-route')
    await expect(page).toHaveURL(/\/unknown-route$/)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })
})
