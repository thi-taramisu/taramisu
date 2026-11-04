import { expect, test } from '@playwright/test'

test.describe('Item Definition page', () => {
  test('renders the headlamp React Flow diagram with nodes, edges, and controls', async ({ page }) => {
    await page.goto('/projects/headlamp/items/i-01')

    await expect(
      page.getByRole('heading', { name: 'Headlamp system', exact: true }),
    ).toBeVisible()

    const diagram = page.locator('.react-flow')
    await expect(diagram).toBeVisible()

    // Check diagram labels independently of similarly named sidebar entries.
    await expect(diagram.getByText('Operational environment')).toBeVisible()
    await expect(diagram.getByText('Item boundary: Headlamp system')).toBeVisible()
    await expect(diagram.getByText('Gateway ECU')).toBeVisible()
    await expect(diagram.getByText('Body control ECU')).toBeVisible()
    await expect(diagram.getByText('Power switch actuator')).toBeVisible()

    // Verify SVG edges and React Flow controls are mounted
    await expect(diagram.locator('.react-flow__edge').first()).toBeAttached()
    await expect(diagram.locator('.react-flow__controls')).toBeVisible()
  })

  test('returns a not-found page for unknown routes', async ({ page }) => {
    await page.goto('/unknown-route')
    await expect(page).toHaveURL(/\/unknown-route$/)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })
})
