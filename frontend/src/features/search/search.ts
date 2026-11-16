import type { SearchResult, SearchType } from '../../api/models/search'
import { ENTITY_TYPES, entityPath } from '../workspace/entities'

export const SEARCH_TYPES: { value: SearchType; label: string }[] = [
  { value: 'projects', label: 'Project' },
  ...Object.entries(ENTITY_TYPES).map(([value, { label }]) => ({ value: value as SearchType, label })),
]

export const searchTypeLabel = (type: SearchType) => SEARCH_TYPES.find((option) => option.value === type)!.label
export const searchResultKey = (result: SearchResult) => `${result.project.id}/${result.type}/${result.id}`
export const searchResultPath = (result: SearchResult) => result.type === 'projects'
  ? `/projects/${result.project.id}`
  : entityPath(result.project.id, result.type, result.id)
