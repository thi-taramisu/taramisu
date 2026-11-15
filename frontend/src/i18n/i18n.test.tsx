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

  it('translates navigation without changing routes or entity names', async () => {
    const { user } = renderApp('/projects/headlamp/items/i-01/assets')
    expect(await screen.findByRole('link', { name: 'Assets (4)' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'de')
    expect(screen.getByRole('navigation', { name: 'Projektelemente' })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Breite der Seitenleiste ändern' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Assets (4)' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Headlamp system' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Headlamp system einklappen' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Risiken' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/projects/headlamp/items/i-01/risks')
    expect(screen.getByRole('link', { name: 'Risiken' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('Reduce')).toBeInTheDocument()
    expect(screen.getAllByText('Medium')).toHaveLength(2)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sprache' }), 'en')
    expect(screen.getByRole('link', { name: 'Risks' })).toHaveAttribute('aria-current', 'page')
  })
})


function leaves(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'string' ? [[prefix + key, child]] : Object.entries(leaves(child as Record<string, unknown>, `${prefix}${key}.`)),
  ))
}

it('has matching translation keys and interpolation variables in both languages', () => {
  for (const namespace of ['common', 'ui']) {
    const en = leaves(i18n.getResourceBundle('en', namespace))
    const de = leaves(i18n.getResourceBundle('de', namespace))
    expect(Object.keys(de).toSorted()).toEqual(Object.keys(en).toSorted())
    for (const key of Object.keys(en)) {
      expect(de[key].trim()).not.toBe('')
      expect(de[key].match(/{{[^}]+}}/g)?.toSorted()).toEqual(en[key].match(/{{[^}]+}}/g)?.toSorted())
    }
  }
})

it.each(['en', 'de'])('uses %s throughout the create-project dialog and preserves the entered name', async (language) => {
  await i18n.changeLanguage(language)
  const { user } = renderApp('/projects')
  const de = language === 'de'
  await user.click(screen.getByRole('button', { name: de ? 'Projekt erstellen' : 'Create Project' }))
  expect(screen.getByRole('dialog', { name: de ? 'Projekt erstellen' : 'Create Project' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: de ? 'Schließen' : 'Close' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: de ? 'Abbrechen' : 'Cancel' })).toBeInTheDocument()
  await user.type(screen.getByLabelText(de ? 'Projektname' : 'Project name'), 'Mein TARA-Projekt')
  await user.click(screen.getByRole('button', { name: de ? /^Erstellen$/ : /^Create$/ }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('Mein TARA-Projekt')).toBeInTheDocument()
})

it('switches an existing validation error without changing the form data', async () => {
  const { user } = renderApp('/projects/headlamp/items/i-01')
  const name = await screen.findByLabelText('Name *')
  await user.clear(name)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Name is required.')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'de')
  expect(screen.getByRole('alert')).toHaveTextContent('Bitte einen Namen eingeben.')
  expect(name).toHaveValue('')
  expect((screen.getByLabelText('Systemgrenze *') as HTMLTextAreaElement).value).toContain('Headlamp system')
})

it('updates existing native validation messages when switching languages', async () => {
  const { user } = renderApp('/projects/headlamp/settings')
  const name = screen.getByLabelText('Name') as HTMLInputElement
  await user.clear(name)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(name.validationMessage).toBe('Please fill out this field.')

  await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'de')
  expect(name.validationMessage).toBe('Bitte fülle dieses Feld aus.')
  expect(name).toHaveValue('')

  await user.type(name, '   ')
  await user.click(screen.getByRole('button', { name: 'Speichern' }))
  expect(name.validationMessage).toBe('Bitte gib einen gültigen Wert ein.')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Sprache' }), 'en')
  expect(name.validationMessage).toBe('Please enter a valid value.')
  expect(name).toHaveValue('   ')

  await user.type(name, 'New project')
  expect(name.validationMessage).toBe('')
  expect(name).toHaveValue('   New project')
})
