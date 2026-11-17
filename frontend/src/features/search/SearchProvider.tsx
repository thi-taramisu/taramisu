import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { SearchContext } from './SearchContext'
import { SearchDialog } from './SearchDialog'

/** One search session across all routes; opening starts with that route's project filter. */
export function SearchProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [session, setSession] = useState({ key: 0, open: false, projectId: '' })
  const opener = useRef<HTMLElement | null>(null)
  const openSearch = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const projectId = matchPath('/projects/:projectId/*', pathname)?.params.projectId ?? ''
    setSession((previous) => ({ key: previous.key + 1, open: true, projectId }))
  }, [pathname])
  const context = useMemo(() => ({ openSearch }), [openSearch])

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return
      // Do not open a second modal over an edit or confirmation dialog.
      if (!session.open && document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      event.preventDefault()
      if (session.open) setSession((previous) => ({ ...previous, open: false }))
      else openSearch()
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [openSearch, session.open])

  // Reset only on a real route change; reopening on that route starts a new session.
  const [previousPath, setPreviousPath] = useState(pathname)
  if (previousPath !== pathname) {
    setPreviousPath(pathname)
    if (session.open) setSession((previous) => ({ ...previous, open: false }))
  }

  return (
    <SearchContext.Provider value={context}>
      {children}
      {session.key > 0 && (
        <SearchDialog
          key={session.key}
          sessionId={session.key}
          open={session.open}
          projectId={session.projectId}
          onOpenChange={(open) => setSession((previous) => ({ ...previous, open }))}
          returnFocus={() => {
            if (opener.current?.isConnected) opener.current.focus()
          }}
        />
      )}
    </SearchContext.Provider>
  )
}
