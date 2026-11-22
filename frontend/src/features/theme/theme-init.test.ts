/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = readFileSync('public/theme-init.js', 'utf8')

function bootstrap(authentik = true, saved: Record<string, string> = {}, blocked = false) {
  const root = document.createElement('html')
  const script = document.createElement('script')
  if (authentik) script.setAttribute('data-authentik', '')
  const events = new EventTarget()
  const storage = new Map(Object.entries(saved))
  runInNewContext(source, {
    document: { documentElement: root, currentScript: script },
    window: events,
    localStorage: { getItem(key: string) {
      if (blocked) throw new Error('Storage unavailable')
      return storage.get(key) ?? null
    } },
  })
  return { root, events, storage }
}

describe('shared theme initializer', () => {
  it.each(['neutral', 'ocean', 'iris'])('initializes Authentik with saved dark %s before components load', (scheme) => {
    const { root } = bootstrap(true, { 'taramisu.theme': 'dark', 'taramisu.colorScheme': scheme })
    expect(root.dataset.colorScheme).toBe(scheme)
    expect(root.dataset.themeChoice).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
    expect(root).toHaveClass('dark', 'pf-theme-dark')
    expect(root.style.colorScheme).toBe('dark')
  })

  it.each<Record<string, string>>([{}, { 'taramisu.theme': 'invalid', 'taramisu.colorScheme': '<script>' }])('defaults to light Neutral for missing/invalid preferences', (saved) => {
    const { root } = bootstrap(true, saved)
    expect(root.dataset.colorScheme).toBe('neutral')
    expect(root.dataset.themeChoice).toBe('light')
    expect(root).not.toHaveClass('pf-theme-dark')
  })

  it('keeps the login usable with storage blocked', () => {
    const { root } = bootstrap(true, {}, true)
    expect(root.dataset.colorScheme).toBe('neutral')
    expect(root.dataset.themeChoice).toBe('light')
  })

  it('updates an open Authentik page on cross-tab changes, removal, and clear', () => {
    const { root, storage, events } = bootstrap()
    storage.set('taramisu.theme', 'dark')
    storage.set('taramisu.colorScheme', 'ocean')
    events.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }))
    expect(root.dataset.themeChoice).toBe('light')
    events.dispatchEvent(new StorageEvent('storage', { key: 'taramisu.theme', newValue: 'dark' }))
    expect(root.dataset.themeChoice).toBe('dark')
    expect(root.dataset.colorScheme).toBe('ocean')
    storage.delete('taramisu.theme')
    events.dispatchEvent(new StorageEvent('storage', { key: 'taramisu.theme' }))
    expect(root.dataset.themeChoice).toBe('light')
    storage.clear()
    events.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(root.dataset.colorScheme).toBe('neutral')
  })

  it('refreshes the preference on back/forward restoration', () => {
    const { root, storage, events } = bootstrap()
    storage.set('taramisu.colorScheme', 'iris')
    events.dispatchEvent(new Event('pageshow'))
    expect(root.dataset.colorScheme).toBe('iris')
  })

  it('does not set Authentik attributes on the frontend', () => {
    const { root } = bootstrap(false, { 'taramisu.theme': 'dark' })
    expect(root).toHaveClass('dark')
    expect(root.dataset.themeChoice).toBeUndefined()
    expect(root).not.toHaveClass('pf-theme-dark')
  })
})
