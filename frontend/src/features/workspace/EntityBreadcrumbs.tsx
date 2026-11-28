import { useTranslation } from 'react-i18next'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import type { TreeNode } from '../../api/models/tree'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { entityPath, entityTitle, hierarchyPathKey, hierarchySearch } from './entities'

/** Data-driven relation path; wrapping keeps even long names fully accessible. */
export function EntityBreadcrumbs({ projectId, path, paths = [] }: { projectId: string; path: readonly TreeNode[]; paths?: TreeNode[][] }) {
  const { t } = useTranslation()
  const { search } = useLocation()
  const [params, setParams] = useSearchParams()

  return (
    <nav aria-label={t('ui:breadcrumbs')} className="flex flex-wrap items-start gap-2 text-sm">
      <ol className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {path.map((node, index) => {
          const current = index === path.length - 1
          const label = entityTitle(node)
          return (
            <li key={`${node.type}/${node.id}`} className="flex min-w-0 max-w-full items-baseline gap-2">
              {index > 0 && <span aria-hidden="true" className="text-muted-foreground">/</span>}
              {current ? (
                <span aria-current="page" className="min-w-0 font-medium wrap-anywhere">{label}</span>
              ) : (
                <Link
                  to={`${entityPath(projectId, node.type, node.id)}${hierarchySearch(search, path.slice(0, index + 1))}`}
                  className="min-w-0 text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-ring focus-visible:outline-2 wrap-anywhere"
                >
                  {label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
      {paths.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6" aria-label={t('ui:selectHierarchyPath')}>
              <ChevronDown aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[48rem] max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto">
            <DropdownMenuRadioGroup value={hierarchyPathKey(path)} onValueChange={(value) => {
              const next = new URLSearchParams(params)
              next.set('hierarchy', value)
              setParams(next)
            }}>
              {paths.map((option) => (
                <DropdownMenuRadioItem key={hierarchyPathKey(option)} value={hierarchyPathKey(option)} className="items-start whitespace-normal wrap-anywhere">
                  {option.map(entityTitle).join(' / ')}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  )
}
