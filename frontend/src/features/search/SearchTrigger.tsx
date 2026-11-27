import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSearch } from './SearchContext'

export function SearchTrigger({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { t } = useTranslation()
  const { openSearch } = useSearch()
  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? 'icon' : 'sm'}
      aria-label={t('search.title')}
      aria-keyshortcuts="Control+k Meta+k"
      className={cn('justify-start gap-2 text-muted-foreground', compact && 'justify-center', className)}
      onClick={openSearch}
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      {!compact && <><span>{t('ui:search')}</span><kbd className="ml-auto hidden text-[10px] opacity-70 sm:inline">Ctrl / ⌘ K</kbd></>}
    </Button>
  )
}
