import { useSyncExternalStore, type ReactNode } from 'react'

const subscribe = () => () => {}

/** Only for content that needs browser layout APIs, such as React Flow. */
export function ClientOnly({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false)
  return hydrated ? children : fallback
}
