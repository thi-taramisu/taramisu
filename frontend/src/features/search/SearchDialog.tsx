import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { LoaderCircle, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useApi } from '../../api/ApiProvider'
import type { SearchResult, SearchType } from '../../api/models/search'
import { useProjects } from '../../api/queries/projects'
import { useAuth } from '../../auth/useAuth'
import { SearchFilters } from './SearchFilters'
import { SearchResults } from './SearchResults'
import { searchResultKey, searchResultPath } from './search'

export function SearchDialog({ sessionId, open, projectId, onOpenChange, returnFocus }: {
  sessionId: number
  open: boolean
  projectId: string
  onOpenChange: (open: boolean) => void
  returnFocus: () => void
}) {
  const { t } = useTranslation()
  const api = useApi()
  const navigate = useNavigate()
  const { status, user } = useAuth()
  const projects = useProjects()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [projectIds, setProjectIds] = useState(projectId ? [projectId] : [])
  const [types, setTypes] = useState<SearchType[]>([])
  const [selectedKey, setSelectedKey] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const hintId = useId()
  const debouncing = query.trim() !== debouncedQuery

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [query])

  const search = useInfiniteQuery({
    // Each query/filter/session gets its own request and cancellation signal. Do not retain another query's results.
    queryKey: ['search', sessionId, status, user?.sub, debouncedQuery, projectIds.toSorted(), types.toSorted()],
    queryFn: ({ signal, pageParam }) => api.search.search({ query: debouncedQuery, projectIds, types, offset: pageParam }, { signal }),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    enabled: open,
    gcTime: 0,
    retry: false,
  })
  const failed = projects.isError || (search.isError && !search.isFetchNextPageError)
  const results = failed ? [] : search.data?.pages.flatMap((page) => page.results) ?? []
  const total = search.data?.pages[0]?.total ?? 0
  const activeKey = results.some((result) => searchResultKey(result) === selectedKey) ? selectedKey : results[0] && searchResultKey(results[0])
  const activeIndex = results.findIndex((result) => searchResultKey(result) === activeKey)
  const searching = debouncing || search.isPending || projects.isPending

  useEffect(() => {
    if (activeKey) resultsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [activeKey])

  function choose(result: SearchResult) {
    if (searching) return
    onOpenChange(false)
    navigate(searchResultPath(result))
  }

  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (searching || results.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
      setSelectedKey(searchResultKey(results[next]))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex >= 0) choose(results[activeIndex])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[max(1rem,10dvh)] flex max-h-[calc(90dvh-1rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={false}
        onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus() }}
        onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus() }}
      >
        <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('search.description')}</DialogDescription>
        <div className="flex shrink-0 items-center gap-3 px-4 pt-4 pb-3">
          <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- Editable ARIA combobox with rich results, not a native select.
            role="combobox"
            aria-label={t('search.inputLabel')}
            aria-autocomplete="list"
            aria-expanded={!failed}
            aria-controls={listId}
            aria-activedescendant={!searching && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            aria-describedby={hintId}
            value={query}
            placeholder={t('search.placeholder')}
            autoComplete="off"
            spellCheck={false}
            className="h-10 min-w-0 border-0 bg-transparent px-3 shadow-none focus-visible:ring-2 dark:bg-transparent"
            onChange={(event) => { setQuery(event.target.value); setSelectedKey(undefined) }}
            onKeyDown={keyboard}
          />
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label={t('ui:close')}>
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
        <SearchFilters
          projects={projects.data ?? []}
          projectIds={projectIds}
          types={types}
          onProjectsChange={(ids) => { setDebouncedQuery(query.trim()); setProjectIds(ids); setSelectedKey(undefined) }}
          onTypesChange={(values) => { setDebouncedQuery(query.trim()); setTypes(values); setSelectedKey(undefined) }}
        />
        <div ref={resultsRef} aria-busy={searching} className="h-[min(52dvh,28rem)] min-h-0 shrink overflow-y-auto overscroll-contain">
          {failed ? (
            <div className="space-y-2 px-5 py-8 text-center">
              <p role="alert">{t('search.loadError')}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => {
                if (projects.isError) void projects.refetch()
                void search.refetch()
              }}>{t('ui:retry')}</Button>
            </div>
          ) : (
            <>
              <output aria-live="polite" className="flex items-center gap-2 px-5 pt-3 text-xs text-muted-foreground">
                {searching ? <><LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />{t('search.searching')}</> : t('search.resultCount', { count: total })}
              </output>
              {!searching && results.length === 0 && (
                <p className="px-5 py-8 text-center text-muted-foreground">{t('search.noResults')}</p>
              )}
              <SearchResults results={results} activeKey={searching ? undefined : activeKey} listId={listId} disabled={searching} onActiveChange={setSelectedKey} onChoose={choose} />
              {search.isFetchNextPageError && <p role="alert" className="px-5 py-2 text-sm text-destructive">{t('search.moreError')}</p>}
              {search.hasNextPage && (
                <div className="px-4 pb-3">
                  <Button type="button" variant="outline" size="sm" className="w-full" disabled={searching || search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
                    {search.isFetchingNextPage ? t('search.loadingMore') : t('search.loadMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <p id={hintId} className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-t bg-muted/30 px-5 py-2.5 text-[11px] text-muted-foreground">
          <span>{t('search.navigateHint')}</span><span>{t('search.openHint')}</span><span>{t('search.closeHint')}</span>
        </p>
      </DialogContent>
    </Dialog>
  )
}
