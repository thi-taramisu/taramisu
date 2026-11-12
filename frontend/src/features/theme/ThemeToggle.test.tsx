import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'
import { THEME_STORAGE_KEY } from './theme'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.removeItem(THEME_STORAGE_KEY)
  document.documentElement.classList.remove('dark')
  document.documentElement.style.removeProperty('color-scheme')
})

describe('ThemeToggle', () => {
  it('shows the current mode, switches immediately and saves the preference', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    const toggle = screen.getByRole('button', { name: 'Dark mode' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveTextContent('Light')
    await user.click(toggle)
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveTextContent('Dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    await user.click(toggle)
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
  it('can be operated with the keyboard', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.tab()
    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('continues switching when browser storage is unavailable', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Dark mode' }))
    expect(document.documentElement).toHaveClass('dark')
    await user.click(screen.getByRole('button', { name: 'Dark mode' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })
  it('synchronizes mounted controls and changes from other tabs', async () => {
    const user = userEvent.setup()
    render(<><ThemeToggle /><ThemeToggle /></>)
    const toggles = screen.getAllByRole('button', { name: 'Dark mode' })
    await user.click(toggles[0])
    expect(toggles[1]).toHaveAttribute('aria-pressed', 'true')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'light' })))
    expect(toggles[0]).toHaveAttribute('aria-pressed', 'false')
    expect(toggles[1]).toHaveAttribute('aria-pressed', 'false')
  })
})
