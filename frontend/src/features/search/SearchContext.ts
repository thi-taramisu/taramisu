import { createContext, useContext } from 'react'

export const SearchContext = createContext({ openSearch: () => {} })
export const useSearch = () => useContext(SearchContext)
