import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { SearchProject, SearchType } from '../../api/models/search'
import { SEARCH_TYPES, searchTypeLabel } from './search'

interface SearchFiltersProps {
  projects: SearchProject[]
  projectIds: string[]
  types: SearchType[]
  onProjectsChange: (ids: string[]) => void
  onTypesChange: (types: SearchType[]) => void
}

/** Type filters are ORed; the project filter narrows their results further. */
export function SearchFilters({ projects, projectIds, types, onProjectsChange, onTypesChange }: SearchFiltersProps) {
  return (
    <div className="shrink-0 space-y-3 border-b px-4 pb-3">
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Element types</legend>
        {SEARCH_TYPES.map(({ value, label }) => (
          <Button
            key={value}
            type="button"
            size="xs"
            variant={types.includes(value) ? 'secondary' : 'ghost'}
            aria-pressed={types.includes(value)}
            onClick={() => onTypesChange(types.includes(value) ? types.filter((type) => type !== value) : [...types, value])}
          >{label}</Button>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="search-project-filter" className="sr-only">Filter by project</Label>
        <NativeSelect
          id="search-project-filter"
          size="sm"
          value=""
          onChange={(event) => {
            if (event.target.value) onProjectsChange([...projectIds, event.target.value])
          }}
        >
          <NativeSelectOption value="">Filter by project…</NativeSelectOption>
          {projects.filter((project) => !projectIds.includes(project.id)).map((project) => (
            <NativeSelectOption key={project.id} value={project.id}>{project.name}</NativeSelectOption>
          ))}
        </NativeSelect>
        {projectIds.length === 0 && <span className="text-xs text-muted-foreground">All accessible projects</span>}
      </div>
      {(projectIds.length > 0 || types.length > 0) && (
        <div aria-label="Active search filters" className="flex flex-wrap gap-1.5">
          {projectIds.map((id) => {
            const name = projects.find((project) => project.id === id)?.name ?? id
            return <FilterChip key={id} label={name} onRemove={() => onProjectsChange(projectIds.filter((projectId) => projectId !== id))} />
          })}
          {types.map((type) => <FilterChip key={type} label={searchTypeLabel(type)} onRemove={() => onTypesChange(types.filter((value) => value !== type))} />)}
          <Button type="button" variant="ghost" size="xs" onClick={() => { onProjectsChange([]); onTypesChange([]) }}>Clear filters</Button>
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Button type="button" variant="outline" size="xs" className="max-w-full rounded-full" aria-label={`Remove ${label} filter`} onClick={onRemove}>
      <span className="truncate">{label}</span><X aria-hidden="true" className="size-3" />
    </Button>
  )
}
