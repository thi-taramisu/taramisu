import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { SearchProject } from '../../api/models/search'

const PAGE_SIZE = 50

/** Search the already accessible project directory, without another modal or network request. */
export function ProjectFilter({ projects, selectedIds, onChange }: {
  projects: SearchProject[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [activeId, setActiveId] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const listId = useId()
  const hintId = useId()
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const matches = projects.filter((project) => terms.every((term) => `${project.name} ${project.id}`.toLocaleLowerCase().includes(term)))
  const activeIndex = Math.max(0, matches.findIndex((project) => project.id === activeId))
  const activeProject = matches[activeIndex]
  const visible = matches.slice(0, Math.max(visibleCount, activeIndex + 1))
  const selected = new Set(selectedIds)

  useEffect(() => {
    if (open && activeProject) list.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeProject])

  function changeQuery(value: string) {
    setQuery(value)
    setActiveId(undefined)
    setVisibleCount(PAGE_SIZE)
  }

  function toggle(projectId: string) {
    onChange(selected.has(projectId) ? selectedIds.filter((id) => id !== projectId) : [...selectedIds, projectId])
    input.current?.focus()
  }

  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || matches.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.min(matches.length - 1, Math.max(0, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)))
      setVisibleCount((count) => Math.max(count, Math.ceil((next + 1) / PAGE_SIZE) * PAGE_SIZE))
      setActiveId(matches[next].id)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeProject) toggle(activeProject.id)
    }
  }

  return (
    <Popover open={open} modal={false} onOpenChange={(next) => {
      setOpen(next)
      if (next) changeQuery('')
    }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="Filter by project" aria-haspopup="listbox" aria-controls={open ? listId : undefined} disabled={projects.length === 0}>
          {selectedIds.length > 0 ? `Projects (${selectedIds.length})` : 'Filter by project…'}
          <ChevronDown aria-hidden="true" className="ml-1 size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="presentation"
        align="start"
        collisionPadding={12}
        className="max-h-(--radix-popover-content-available-height) w-[min(22rem,calc(100vw-3rem))] gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => { event.preventDefault(); input.current?.focus() }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b p-2">
          <Search aria-hidden="true" className="ml-1 size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={input}
            // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- Editable combobox with multiselect options, not a native select.
            role="combobox"
            aria-label="Search projects"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-describedby={hintId}
            aria-activedescendant={activeProject ? `${listId}-${activeIndex}` : undefined}
            placeholder="Find a project by name or ID…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            className="h-8 min-w-0 border-0 bg-transparent shadow-none dark:bg-transparent"
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={keyboard}
          />
          {query && (
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Clear project search" onClick={() => { changeQuery(''); input.current?.focus() }}>
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
        {/* The input owns keyboard focus; options expose selection separately from the active cursor. */}
        {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- Rich multiselect listbox controlled by the combobox input. */}
        <div ref={list} id={listId} role="listbox" aria-label="Project filters" aria-multiselectable="true" className="max-h-60 min-h-0 overflow-y-auto overscroll-contain p-1">
          {visible.map((project, index) => (
            <button
              key={project.id}
              id={`${listId}-${index}`}
              type="button"
              // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- Combobox options keep focus in the input and show project metadata.
              role="option"
              tabIndex={-1}
              aria-label={`${project.name} (${project.id})`}
              aria-selected={selected.has(project.id)}
              data-active={project.id === activeProject?.id}
              className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm', project.id === activeProject?.id && 'bg-accent text-accent-foreground')}
              onPointerMove={() => setActiveId(project.id)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => toggle(project.id)}
            >
              <Check aria-hidden="true" className={cn('size-4 shrink-0', !selected.has(project.id) && 'invisible')} />
              <span className="min-w-0">
                <span className="block truncate font-medium" title={project.name}>{project.name}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground" title={project.id}>{project.id}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="shrink-0 space-y-2 border-t p-2 text-xs text-muted-foreground">
          <output className="block px-1" aria-live="polite">
            {matches.length === 0 ? 'No projects found.' : `${visible.length} of ${matches.length} ${matches.length === 1 ? 'project' : 'projects'}`}
          </output>
          {visible.length < matches.length && (
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => {
              setVisibleCount((count) => count + PAGE_SIZE)
              input.current?.focus()
            }}>Show more projects</Button>
          )}
          <p id={hintId} className="px-1">↑ ↓ Navigate · Enter Toggle · Esc Close</p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
