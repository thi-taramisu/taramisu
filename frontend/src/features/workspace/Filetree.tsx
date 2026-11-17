import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Box, ChevronRight, FileWarning, Folder, Inbox, Route, ShieldAlert } from 'lucide-react'
import { matchPath, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { EntityType, TreeNode } from '../../api/models/tree'
import { ENTITY_TYPES, entityPath, entityTitle, nodesBelow } from './entities'
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
    return selectedPath === path || containsRoute(nodesBelow(node), projectId, selectedPath)
  })
}

/** Branches start expanded and reveal a newly selected descendant; tab switches must preserve manual collapse choices. */
function useExpanded(nodes: readonly TreeNode[], projectId: string, selectedPath: string) {
  const [branch, setBranch] = useState({ selectedPath, expanded: true })
  const reveal = branch.selectedPath !== selectedPath && containsRoute(nodes, projectId, selectedPath)
  const expanded = branch.expanded || reveal
  if (branch.selectedPath !== selectedPath) setBranch({ selectedPath, expanded })
  return [expanded, (open: boolean) => setBranch({ selectedPath, expanded: open })] as const
}

function BranchChevron({ expanded }: { expanded: boolean }) {
  return <ChevronRight aria-hidden="true" className={`size-3.5 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
}

/** Link of a row, or the toggle of a row without a page ("Unassigned"); the arrow keys move between these. */
function rowTarget(row: Element | null | undefined) {
  return row?.querySelector('a') ?? row?.querySelector('button') ?? undefined
}

interface BranchProps {
  node: TreeNode
  projectId: string
  selectedPath: string
  search: string
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

function FiletreeBranch({ node, projectId, selectedPath, search, onKeyDown }: BranchProps) {
  const below = nodesBelow(node)
  const [expanded, setExpanded] = useExpanded(below, projectId, selectedPath)
  const hasChildren = below.length > 0
  const Icon = icons[node.type]

  return (
    <Collapsible asChild open={expanded} onOpenChange={setExpanded}>
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
                <BranchChevron expanded={expanded} />
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
              {/* Only while something is unassigned; otherwise the section would be an empty row below every item. */}
              {node.unassigned?.length ? (
                <FiletreeUnassigned item={node} nodes={node.unassigned} projectId={projectId} selectedPath={selectedPath} search={search} onKeyDown={onKeyDown} />
              ) : null}
            </ul>
          </CollapsibleContent>
        )}
      </li>
    </Collapsible>
  )
}

interface UnassignedProps extends Omit<BranchProps, 'node'> {
  item: TreeNode
  nodes: TreeNode[]
}

/** "Unassigned" section of an item (Flexible Definition wireframe): its elements without links, grouped by type. */
function FiletreeUnassigned({ item, nodes, projectId, selectedPath, search, onKeyDown }: UnassignedProps) {
  const id = useId()
  const [expanded, setExpanded] = useExpanded(nodes, projectId, selectedPath)
  const groups = (Object.keys(ENTITY_TYPES) as EntityType[])
    .map((type) => ({ type, nodes: nodes.filter((node) => node.type === type) }))
    .filter((group) => group.nodes.length > 0)

  return (
    <Collapsible asChild open={expanded} onOpenChange={setExpanded}>
      <li>
        <div data-filetree-row className="flex min-w-0 items-center rounded-md">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              onKeyDown={onKeyDown}
              className="flex min-w-0 flex-1 items-center gap-0.5 rounded-md border border-dashed border-sidebar-border text-[13px] leading-[18px] text-muted-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                <BranchChevron expanded={expanded} />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1">
                <Inbox aria-hidden="true" className="size-3.5 shrink-0" />
                {/* Read as "Unassigned in Headlamp system, 3 elements", so the sections of several items stay apart. The spaces
                    sit outside the spans so the accessible name keeps them; flex layout does not render them. */}
                <span className="truncate">Unassigned</span>{' '}
                <span className="sr-only">in {entityTitle(item)},</span>{' '}
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-xs tabular-nums">
                  {nodes.length}
                </span>{' '}
                <span className="sr-only">{nodes.length === 1 ? 'element' : 'elements'}</span>
              </span>
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent asChild forceMount hidden={!expanded}>
          <ul className="mt-[3px] ml-3 space-y-[3px] border-l border-sidebar-border pl-1">
            {groups.map((group) => (
              <li key={group.type}>
                {/* Named "Damage scenarios in Headlamp system", so the lists of several items stay apart. */}
                <div id={`${id}-${group.type}`} className="px-1.5 pt-1 pb-0.5 text-[11px] font-medium uppercase text-muted-foreground">
                  {ENTITY_TYPES[group.type].label}s{' '}<span className="sr-only">in {entityTitle(item)}</span>
                </div>
                <ul aria-labelledby={`${id}-${group.type}`} className="space-y-[3px]">
                  {group.nodes.map((node) => (
                    <FiletreeBranch key={`${node.type}/${node.id}`} node={node} projectId={projectId} selectedPath={selectedPath} search={search} onKeyDown={onKeyDown} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
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
    const current = rowTarget(row)
    if (!item || !current || !root.current) return

    const targets = Array.from(root.current.querySelectorAll('[data-filetree-row]'))
      .filter((entry) => !entry.closest('[hidden]'))
      .map(rowTarget)
    const index = targets.indexOf(current)
    const toggle = row?.querySelector('button')
    let target: HTMLElement | undefined

    switch (event.key) {
      case 'ArrowDown': target = targets[index + 1]; break
      case 'ArrowUp': target = targets[index - 1]; break
      case 'Home': target = targets[0]; break
      case 'End': target = targets.at(-1); break
      case 'ArrowRight':
        if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click()
        else target = rowTarget(item.querySelector(':scope > ul [data-filetree-row]'))
        break
      case 'ArrowLeft':
        if (toggle?.getAttribute('aria-expanded') === 'true') {
          toggle.click()
          target = current
        } else {
          // The type groups of "Unassigned" are list entries without a row, so they are skipped.
          let parent = item.parentElement?.closest('li')
          while (parent && !parent.querySelector(':scope > [data-filetree-row]')) parent = parent.parentElement?.closest('li')
          target = rowTarget(parent?.querySelector(':scope > [data-filetree-row]'))
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
