import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppearanceControls } from './AppearanceControls'
import { COLOR_SCHEME_STORAGE_KEY, THEME_STORAGE_KEY } from './theme'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY)
  localStorage.removeItem(THEME_STORAGE_KEY)
  document.documentElement.removeAttribute('data-color-scheme')
  document.documentElement.classList.remove('dark')
  document.documentElement.style.removeProperty('color-scheme')
})

describe('AppearanceControls', () => {
  it('applies and saves each palette while keeping dark mode independent', async () => {
    const user = userEvent.setup()
    render(<AppearanceControls />)
    const select = screen.getByRole('combobox', { name: 'Color scheme' })
    expect(select).toHaveValue('neutral')
    await user.click(screen.getByRole('button', { name: 'Dark mode' }))
    for (const value of ['ocean', 'iris', 'neutral']) {
      await user.selectOptions(select, value)
      expect(document.documentElement).toHaveAttribute('data-color-scheme', value)
      expect(document.documentElement).toHaveClass('dark')
      expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe(value)
    }
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
  it('synchronizes controls and palettes changed from another tab', async () => {
    const user = userEvent.setup()
    render(<><AppearanceControls /><AppearanceControls /></>)
    const selects = screen.getAllByRole('combobox', { name: 'Color scheme' })
    await user.selectOptions(selects[0], 'ocean')
    expect(selects[1]).toHaveValue('ocean')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: COLOR_SCHEME_STORAGE_KEY, newValue: 'iris' })))
    expect(selects[0]).toHaveValue('iris')
    expect(selects[1]).toHaveValue('iris')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null })))
    expect(selects[0]).toHaveValue('neutral')
    expect(document.documentElement).not.toHaveClass('dark')
  })
  it('keeps palette selection usable without storage', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    render(<AppearanceControls />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Color scheme' }), 'iris')
    expect(document.documentElement).toHaveAttribute('data-color-scheme', 'iris')
  })
})
