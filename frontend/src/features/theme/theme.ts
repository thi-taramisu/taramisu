import { useSyncExternalStore } from 'react'
import type { ColorScheme } from '../design-system/colorSchemes'

export type Theme = 'light' | 'dark'
export type ColorSchemeId = ColorScheme['id']
// Also used by the blocking startup script in public/theme-init.js.
export const THEME_STORAGE_KEY = 'taramisu.theme'
export const COLOR_SCHEME_STORAGE_KEY = 'taramisu.colorScheme'
const THEME_EVENT = 'taramisu:theme-change'

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}
function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}
function validScheme(value: string | null): ColorSchemeId {
  return value === 'ocean' || value === 'iris' ? value : 'neutral'
}
function applyColorScheme(scheme: ColorSchemeId) {
  document.documentElement.dataset.colorScheme = scheme
}
function currentColorScheme(): ColorSchemeId {
  return validScheme(document.documentElement.getAttribute('data-color-scheme'))
}
function subscribe(listener: () => void) {
  function syncStorage(event: StorageEvent) {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      applyTheme(event.newValue === 'dark' ? 'dark' : 'light')
    } else if (event.key !== COLOR_SCHEME_STORAGE_KEY) return
    if (event.key === COLOR_SCHEME_STORAGE_KEY || event.key === null) applyColorScheme(validScheme(event.newValue))
    listener()
  }
  window.addEventListener(THEME_EVENT, listener)
  window.addEventListener('storage', syncStorage)
  return () => {
    window.removeEventListener(THEME_EVENT, listener)
    window.removeEventListener('storage', syncStorage)
  }
}
export function setTheme(theme: Theme) {
  applyTheme(theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Keep the toggle usable when persistence is unavailable.
  }
  window.dispatchEvent(new Event(THEME_EVENT))
}
export function useTheme() {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light' as const)
}

export function setColorScheme(scheme: ColorSchemeId) {
  const next = validScheme(scheme)
  applyColorScheme(next)
  try {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, next)
  } catch {
    // Changing colors still works when browser storage is blocked.
  }
  window.dispatchEvent(new Event(THEME_EVENT))
}
export function useColorScheme() {
  return useSyncExternalStore(subscribe, currentColorScheme, () => 'neutral' as const)
}
