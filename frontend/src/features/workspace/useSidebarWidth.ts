import { useCallback, useState, useSyncExternalStore } from 'react'

/** Width limits of the project element sidebar, in CSS pixels. The default matches the former `w-72`. */
export const SIDEBAR_WIDTH = { default: 288, min: 200, max: 560 } as const
/** Width the main content keeps when the window becomes narrow. */
export const MIN_CONTENT_WIDTH = 360
export const SIDEBAR_WIDTH_STORAGE_KEY = 'taramisu.workspace.sidebarWidth'

/** Largest sidebar width that still leaves the main content usable in a viewport of this width. */
export function maxSidebarWidth(viewportWidth: number) {
  return Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, viewportWidth - MIN_CONTENT_WIDTH))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Saved width, or the default when nothing valid is stored (missing, non-numeric, out of range, or storage blocked). */
export function readStoredSidebarWidth() {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    const width = raw === null || raw.trim() === '' ? Number.NaN : Number(raw)
    return Number.isFinite(width) && width >= SIDEBAR_WIDTH.min && width <= SIDEBAR_WIDTH.max ? width : SIDEBAR_WIDTH.default
  } catch {
    return SIDEBAR_WIDTH.default
  }
}

function storeSidebarWidth(width: number) {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the width then lasts only for this session.
  }
}

function subscribeToViewport(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

const viewportWidth = () => window.innerWidth

/**
 * Sidebar width chosen by the user, persisted in local storage and kept within the limits. The rendered `width` also
 * shrinks with a narrow window so the main content stays usable, and returns to the chosen width when the window grows.
 */
export function useSidebarWidth() {
  const [preferred, setPreferred] = useState(readStoredSidebarWidth)
  const max = maxSidebarWidth(useSyncExternalStore(subscribeToViewport, viewportWidth))
  const width = clamp(preferred, SIDEBAR_WIDTH.min, max)

  /** Sets the width, clamped to the current limits. Pass `persist: false` for intermediate drag positions. */
  const setWidth = useCallback((next: number, { persist = true } = {}) => {
    const clamped = Math.round(clamp(next, SIDEBAR_WIDTH.min, max))
    setPreferred(clamped)
    if (persist) storeSidebarWidth(clamped)
  }, [max])

  return { width, min: SIDEBAR_WIDTH.min, max, setWidth }
}
