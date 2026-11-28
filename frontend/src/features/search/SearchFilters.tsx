import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { SearchProject, SearchType } from '../../api/models/search'
import { SEARCH_TYPES } from './search'
import { ProjectFilter } from './ProjectFilter'

interface SearchFiltersProps {
  projects: SearchProject[]
  projectIds: string[]
  types: SearchType[]
  onProjectsChange: (ids: string[]) => void
  onTypesChange: (types: SearchType[]) => void
}

/** Type filters are ORed; the project filter narrows their results further. */
export function SearchFilters({ projects, projectIds, types, onProjectsChange, onTypesChange }: SearchFiltersProps) {
  const { t } = useTranslation()
  return (
    <div className="shrink-0 space-y-3 border-b px-4 pb-3">
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">{t('search.elementTypes')}</legend>
        {SEARCH_TYPES.map((value) => (
          <Button
            key={value}
            type="button"
            size="xs"
            variant={types.includes(value) ? 'secondary' : 'outline'}
            aria-pressed={types.includes(value)}
            onClick={() => onTypesChange(types.includes(value) ? types.filter((type) => type !== value) : [...types, value])}
          >{t(`search.types.${value}`)}</Button>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <ProjectFilter projects={projects} selectedIds={projectIds} onChange={onProjectsChange} />
        {projectIds.length === 0 && <span className="text-xs text-muted-foreground">{t('search.allProjects')}</span>}
      </div>
      {(projectIds.length > 0 || types.length > 0) && (
        <div aria-label={t('search.activeFilters')} className="flex flex-wrap gap-1.5">
          {projectIds.map((id) => {
            const name = projects.find((project) => project.id === id)?.name ?? id
            return <FilterChip key={id} label={name} onRemove={() => onProjectsChange(projectIds.filter((projectId) => projectId !== id))} />
          })}
          <Button type="button" variant="ghost" size="xs" onClick={() => { onProjectsChange([]); onTypesChange([]) }}>{t('search.clearFilters')}</Button>
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useTranslation()
  return (
    <Button type="button" variant="outline" size="xs" className="max-w-full rounded-full" aria-label={t('search.removeFilter', { name: label })} onClick={onRemove}>
      <span className="truncate">{label}</span><X aria-hidden="true" className="size-3" />
    </Button>
  )
}
