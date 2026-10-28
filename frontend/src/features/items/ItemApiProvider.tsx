import { createContext, useContext, type ReactNode } from 'react'
import type { ItemApi } from './itemApi'

const ItemApiContext = createContext<ItemApi | null>(null)

/** Provides the item API; the app passes the mock until the backend client (#118) replaces it. */
export function ItemApiProvider({ api, children }: { api: ItemApi; children: ReactNode }) {
  return <ItemApiContext.Provider value={api}>{children}</ItemApiContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useItemApi() {
  const api = useContext(ItemApiContext)
  if (!api) throw new Error('useItemApi must be used inside <ItemApiProvider>')
  return api
}
