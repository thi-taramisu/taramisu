import { expect, test } from '@playwright/test'

test.describe('Project element sidebar', () => {
  test('resizes by dragging, gives the space to the content, and keeps the width after a reload', async ({ page }) => {
    await page.goto('/projects/headlamp')

    const sidebar = page.getByRole('navigation', { name: 'Project elements' })
    const content = page.getByRole('main')
    const handle = page.getByRole('separator', { name: 'Resize project elements' })
    const sidebarWidth = async () => (await sidebar.boundingBox())!.width
    const contentWidth = async () => (await content.boundingBox())!.width

    await expect(sidebar).toBeVisible()
    // Widths are polled: React applies pointer-driven updates asynchronously.
    await expect.poll(sidebarWidth).toBe(288)
    const initialContentWidth = await contentWidth()

    const box = (await handle.boundingBox())!
    const y = box.y + box.height / 2
    await page.mouse.move(box.x + box.width / 2, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 100, y, { steps: 5 })

    await expect.poll(sidebarWidth).toBe(388)
    await expect.poll(contentWidth).toBe(initialContentWidth - 100)
    expect(await page.evaluate('String(window.getSelection())')).toBe('')

    // Dragging past the maximum stops at the limit; releasing outside the 1280px window still ends the drag.
    await page.mouse.move(2000, y, { steps: 5 })
    await expect.poll(sidebarWidth).toBe(560)
    await page.mouse.up()
    await page.mouse.move(300, y)
    await expect.poll(sidebarWidth).toBe(560)

    await page.reload()
    await expect(sidebar).toBeVisible()
    await expect.poll(sidebarWidth).toBe(560)
  })
})
