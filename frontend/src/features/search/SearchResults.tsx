import { ArrowUpRight, Box, FileText, Folder, GitBranch, Shield, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SearchResult, SearchType } from '../../api/models/search'
import { searchResultKey, searchTypeLabel } from './search'

const ICONS = { projects: Folder, items: Box, assets: Shield, 'damage-scenarios': TriangleAlert, 'threat-scenarios': FileText, 'attack-paths': GitBranch } satisfies Record<SearchType, typeof Folder>

export function SearchResults({ results, activeKey, listId, disabled, onActiveChange, onChoose }: {
  results: SearchResult[]
  activeKey: string | undefined
  listId: string
  disabled: boolean
  onActiveChange: (key: string) => void
  onChoose: (result: SearchResult) => void
}) {
  return (
    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- Rich ARIA combobox popup; native select cannot contain these result details.
    <div id={listId} role="listbox" aria-label="Search results" className="space-y-1 p-2">
      {results.map((result, index) => {
        const key = searchResultKey(result)
        const Icon = ICONS[result.type]
        return (
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            key={key}
            id={`${listId}-${index}`}
            // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- Combobox options keep DOM focus in the input and display rich content.
            role="option"
            aria-selected={activeKey === key}
            onPointerMove={() => onActiveChange(key)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChoose(result)}
            className={cn('flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left', activeKey === key && 'bg-accent text-accent-foreground')}
          >
            <Icon aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium" title={result.name}>{result.name}</span>
              <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <span>{searchTypeLabel(result.type)}</span><span className="font-mono break-all">{result.code || result.id}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground" title={result.project.name}>
                {result.project.name}{result.item && result.type !== 'items' && ` · ${result.item.name}`}
              </span>
            </span>
            {activeKey === key && <ArrowUpRight aria-hidden="true" className="mt-1 size-4 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
