import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { SIDEBAR_WIDTH_STORAGE_KEY } from './useSidebarWidth'

const project = '/projects/headlamp'
const sidebar = () => screen.getByRole('navigation', { name: 'Project elements' })
const handle = () => screen.getByRole('separator', { name: 'Resize project elements' })
const storedWidth = () => localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)

function setViewportWidth(width: number) {
  act(() => {
    window.innerWidth = width
    window.dispatchEvent(new Event('resize'))
  })
}

function expectWidth(width: number) {
  expect(sidebar()).toHaveStyle({ width: `${width}px` })
  expect(handle()).toHaveAttribute('aria-valuenow', String(width))
}

const defaultViewport = window.innerWidth

beforeEach(() => {
  // jsdom does not implement pointer capture.
  Element.prototype.setPointerCapture = () => {}
})

afterEach(() => {
  localStorage.clear()
  setViewportWidth(defaultViewport)
})

describe('resizable project element sidebar', () => {
  it('starts at the default width with the limits exposed on the handle', () => {
    renderApp(project)

    expectWidth(288)
    expect(handle()).toHaveAttribute('aria-valuemin', '200')
    expect(handle()).toHaveAttribute('aria-valuemax', '560')
    expect(handle()).toHaveAttribute('aria-controls', sidebar().id)
  })

  it('follows the pointer while dragging, blocks text selection, and saves the width on release', () => {
    renderApp(project)

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 288 })
    expect(document.body).toHaveClass('select-none', 'cursor-col-resize')

    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 400 })
    expectWidth(400)
    expect(storedWidth()).toBeNull()

    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 400 })
    expect(document.body).not.toHaveClass('select-none')
    expect(document.body).not.toHaveClass('cursor-col-resize')
    expect(storedWidth()).toBe('400')

    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 450 })
    expectWidth(400)
  })

  it('keeps the width between the minimum and maximum', () => {
    renderApp(project)

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 288 })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 20 })
    expectWidth(200)
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 2000 })
    expectWidth(560)
    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 2000 })
    expect(storedWidth()).toBe('560')
  })

  it('ends the drag when pointer capture is lost, e.g. on release outside the window', () => {
    renderApp(project)

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 288 })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 320 })
    fireEvent(handle(), new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }))

    expect(document.body).not.toHaveClass('select-none')
    expect(storedWidth()).toBe('320')
  })

  it('does not save the window-clamped width when the handle is only clicked', () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '500')
    renderApp(project)
    setViewportWidth(700)

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 340 })
    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 340 })
    expect(storedWidth()).toBe('500')

    setViewportWidth(1200)
    expectWidth(500)
  })

  it('restores text selection when the handle unmounts during a drag', () => {
    renderApp(project)

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 288 })
    expect(document.body).toHaveClass('select-none')
    cleanup()

    expect(document.body).not.toHaveClass('select-none')
    expect(document.body).not.toHaveClass('cursor-col-resize')
  })

  it('restores the saved width after a reload', () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '420')
    renderApp(project)

    expect(sidebar()).toHaveStyle({ width: '420px' })
    expect(handle()).toHaveAttribute('aria-valuenow', '420')
  })

  it.each(['abc', '', '50', '9999'])('uses the default width when the saved width %j is invalid', (saved) => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, saved)
    renderApp(project)

    expect(sidebar()).toHaveStyle({ width: '288px' })
    expect(handle()).toHaveAttribute('aria-valuenow', '288')
  })

  it('narrows with a small window so the content stays usable, and returns to the chosen width', () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '500')
    renderApp(project)

    setViewportWidth(700)
    expectWidth(340)
    expect(handle()).toHaveAttribute('aria-valuemax', '340')

    setViewportWidth(400)
    expectWidth(200)

    setViewportWidth(1200)
    expectWidth(500)
  })

  it('resizes with the keyboard and resets to the default on double-click', async () => {
    const { user } = renderApp(project)

    handle().focus()
    await user.keyboard('{ArrowRight}')
    expectWidth(304)
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expectWidth(240)
    await user.keyboard('{End}')
    expectWidth(560)
    await user.keyboard('{Home}')
    expectWidth(200)
    expect(storedWidth()).toBe('200')

    await user.dblClick(handle())
    expectWidth(288)
    expect(storedWidth()).toBe('288')
  })
})
