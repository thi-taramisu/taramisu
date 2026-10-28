import { useRef, useState, type KeyboardEvent } from 'react'
import { Box, ChevronRight, FileWarning, Folder, Route, ShieldAlert } from 'lucide-react'
import { matchPath, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { EntityType, TreeNode } from '../../api/models/tree'
import { entityPath, entityTitle } from './entities'
import { FiletreeLink } from './FiletreeLink'

const icons = {
  items: Folder,
  assets: Box,
  'damage-scenarios': FileWarning,
  'threat-scenarios': ShieldAlert,
  'attack-paths': Route,
} satisfies Record<EntityType, typeof Folder>

function containsRoute(nodes: readonly TreeNode[], projectId: string, selectedPath: string): boolean {
  return nodes.some((node) => {
    const path = entityPath(projectId, node.type, node.id)
    return selectedPath === path ||
      (node.children ? containsRoute(node.children, projectId, selectedPath) : false)
  })
}

interface BranchProps {
  node: TreeNode
  projectId: string
  selectedPath: string
  search: string
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

function FiletreeBranch({ node, projectId, selectedPath, search, onKeyDown }: BranchProps) {
  const [branch, setBranch] = useState({ selectedPath, expanded: true })
  const hasChildren = Boolean(node.children?.length)
  const Icon = icons[node.type]

  // Reveal a newly selected entity; tab switches must preserve manual collapse choices.
  const reveal = branch.selectedPath !== selectedPath && node.children && containsRoute(node.children, projectId, selectedPath)
  const expanded = branch.expanded || Boolean(reveal)
  if (branch.selectedPath !== selectedPath) setBranch({ selectedPath, expanded })

  return (
    <Collapsible asChild open={expanded} onOpenChange={(open) => setBranch({ selectedPath, expanded: open })}>
      <li>
        <div data-filetree-row className="flex min-w-0 items-center gap-0.5 rounded-md">
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6 rounded-md"
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entityTitle(node)}`}
                onKeyDown={onKeyDown}
              >
                <ChevronRight aria-hidden="true" className={`size-3.5 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          ) : <span aria-hidden="true" className="w-6 shrink-0" />}
          <FiletreeLink node={node} projectId={projectId} search={search} icon={Icon} onKeyDown={onKeyDown} />
        </div>
        {hasChildren && (
          <CollapsibleContent asChild forceMount hidden={!expanded}>
            <ul className="mt-[3px] ml-3 space-y-[3px] border-l border-sidebar-border pl-1">
              {node.children?.map((child) => (
                <FiletreeBranch key={`${child.type}/${child.id}`} node={child} projectId={projectId} selectedPath={selectedPath} search={search} onKeyDown={onKeyDown} />
              ))}
            </ul>
          </CollapsibleContent>
        )}
      </li>
    </Collapsible>
  )
}

/** Disclosure navigation: native Tab/Enter/Space, with optional arrow-key navigation. */
export function Filetree({ nodes, projectId }: { nodes: readonly TreeNode[]; projectId: string }) {
  const { pathname, search } = useLocation()
  const selectedPath = matchPath('/projects/:projectId/:type/:entityId/*', pathname)?.pathnameBase ?? pathname
  const root = useRef<HTMLUListElement>(null)

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const row = event.currentTarget.closest('[data-filetree-row]')
    const item = row?.parentElement
    const link = row?.querySelector('a')
    if (!item || !link || !root.current) return

    const links = Array.from(root.current.querySelectorAll('a')).filter((entry) => !entry.closest('[hidden]'))
    const index = links.indexOf(link)
    const toggle = row?.querySelector('button')
    let target: HTMLAnchorElement | undefined

    switch (event.key) {
      case 'ArrowDown': target = links[index + 1]; break
      case 'ArrowUp': target = links[index - 1]; break
      case 'Home': target = links[0]; break
      case 'End': target = links.at(-1); break
      case 'ArrowRight':
        if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click()
        else target = item.querySelector<HTMLAnchorElement>(':scope > ul a') ?? undefined
        break
      case 'ArrowLeft':
        if (toggle?.getAttribute('aria-expanded') === 'true') {
          toggle.click()
          target = link
        } else {
          target = item.parentElement?.closest('li')?.querySelector('[data-filetree-row] a') ?? undefined
        }
        break
      default: return
    }
    event.preventDefault()
    target?.focus()
  }

  if (nodes.length === 0) return <p className="px-2 py-3 text-sm text-muted-foreground">No project elements yet.</p>

  return (
    <ul ref={root} className="space-y-[3px]">
      {nodes.map((node) => (
        <FiletreeBranch key={`${node.type}/${node.id}`} node={node} projectId={projectId} selectedPath={selectedPath} search={search} onKeyDown={handleKeyDown} />
      ))}
    </ul>
  )
}
