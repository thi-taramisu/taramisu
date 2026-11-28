import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAuth } from '@/auth/useAuth'

/** Signed out: the cached data of the last session (projects, their content, search results) is not shown. */
export function useResetQueriesOnSignOut() {
  const { status } = useAuth()
  const queryClient = useQueryClient()
  const previous = useRef(status)

  useEffect(() => {
    const ended = previous.current === 'authenticated' && status === 'unauthenticated'
    previous.current = status
    if (!ended) return
    // Cancelled first, so a request of the ended session cannot fill the cache again.
    void queryClient.cancelQueries()
    void queryClient.resetQueries()
  }, [queryClient, status])
}
