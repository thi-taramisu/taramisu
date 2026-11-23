import type { SearchResult, SearchType } from '../../api/models/search'
import { ENTITY_TYPES, entityPath } from '../workspace/entities'

export const SEARCH_TYPES: SearchType[] = ['projects', ...Object.keys(ENTITY_TYPES) as SearchType[]]
export const searchResultKey = (result: SearchResult) => `${result.project.id}/${result.type}/${result.id}`
export const searchResultPath = (result: SearchResult) => result.type === 'projects'
  ? `/projects/${result.project.id}`
  : entityPath(result.project.id, result.type, result.id)
