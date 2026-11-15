import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageSelector } from '@/components/layout/LanguageSelector'
import { renderApp } from '@/test/renderApp'
import { i18n, changeLanguage, getInitialLanguage } from './index'

beforeEach(async () => {
  localStorage.removeItem('taramisu.language')
  await i18n.changeLanguage('en')
})

afterEach(async () => {
  vi.restoreAllMocks()
  localStorage.removeItem('taramisu.language')
  await act(() => i18n.changeLanguage('en'))
})

describe('initial language', () => {
  it.each([
    ['de', ['en-GB'], 'de'],
    ['en', ['de-DE'], 'en'],
    [null, ['fr-FR', 'de-AT', 'en-US'], 'de'],
    ['unsupported', ['en-US', 'de-DE'], 'en'],
    [null, ['fr-FR'], 'en'],
  ])('uses saved %s and browser %j to select %s', (saved, languages, expected) => {
    if (saved) localStorage.setItem('taramisu.language', saved)
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages)
    expect(getInitialLanguage()).toBe(expected)
  })

  it('uses browser preferences when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE'])
    expect(getInitialLanguage()).toBe('de')
  })
})

describe('language selector', () => {
  it('switches both ways, updates the page language and saves the preference', async () => {
    const user = userEvent.setup()
    render(<LanguageSelector />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'de')
    expect(screen.getByRole('combobox', { name: 'Sprache' })).toHaveValue('de')
    expect(document.documentElement.lang).toBe('de')
    expect(localStorage.getItem('taramisu.language')).toBe('de')
    expect(getInitialLanguage()).toBe('de')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sprache' }), 'en')
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem('taramisu.language')).toBe('en')
  })

  it('still switches when saving is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    render(<LanguageSelector />)
    await userEvent.setup().selectOptions(screen.getByRole('combobox'), 'de')
    expect(screen.getByRole('combobox', { name: 'Sprache' })).toHaveValue('de')
    expect(document.documentElement.lang).toBe('de')
  })

  it.each(['/projects', '/projects/headlamp', '/projects/headlamp/settings'])(
    'is available in the header at %s',
    (path) => {
      renderApp(path)
      expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en')
    },
  )

  it('ignores unsupported choices', () => {
    changeLanguage('fr')
    expect(i18n.resolvedLanguage).toBe('en')
    expect(localStorage.getItem('taramisu.language')).toBeNull()
  })
})
