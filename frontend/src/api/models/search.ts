import type { EntityType } from './tree'

export type SearchType = 'projects' | EntityType

export interface SearchProject {
  id: string
  name: string
}

export interface SearchResult {
  id: string
  code?: string
  name: string
  type: SearchType
  project: SearchProject
  item?: { id: string; name: string }
}

export interface SearchRequest {
  query: string
  projectIds: string[]
  types: SearchType[]
  offset: number
}

export interface SearchPage {
  results: SearchResult[]
  total: number
  nextOffset: number | null
}
