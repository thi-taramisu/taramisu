import { useEffect, useRef, type ComponentType, type KeyboardEventHandler } from 'react'
import { NavLink } from 'react-router-dom'
import { ENTITY_TYPES, entityPath, type TreeNode } from './entities'

interface FiletreeLinkProps {
  node: TreeNode
  projectId: string
  search: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  onKeyDown: KeyboardEventHandler<HTMLAnchorElement>
}

export function FiletreeLink({ node, projectId, search, icon: Icon, onKeyDown }: FiletreeLinkProps) {
  const label = useRef<HTMLSpanElement>(null)
  const animation = useRef<Animation | null>(null)
  const interaction = useRef({ hovered: false, focused: false })

  function stopScrolling() {
    animation.current?.cancel()
    animation.current = null
  }

  function startScrolling() {
    if (animation.current) return
    const text = label.current
    const viewport = text?.parentElement
    if (!text || !viewport || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const distance = text.scrollWidth - viewport.clientWidth
    if (distance <= 0) return

    const duration = Math.max(2000, distance / 35 * 1000) + 1200
    const pause = 600 / duration
    animation.current = text.animate([
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: pause },
      { transform: `translateX(-${distance}px)`, offset: 1 - pause },
      { transform: `translateX(-${distance}px)`, offset: 1 },
    ], { duration, iterations: Infinity, direction: 'alternate', easing: 'linear' })
  }

  function updateScrolling(source: 'hovered' | 'focused', active: boolean) {
    interaction.current[source] = active
    if (interaction.current.hovered || interaction.current.focused) startScrolling()
    else stopScrolling()
  }

  useEffect(() => () => animation.current?.cancel(), [])

  return (
    <NavLink
      to={{ pathname: entityPath(projectId, node.type, node.id), search }}
      title={`${ENTITY_TYPES[node.type].label}: ${node.code} ${node.name}`}
      onKeyDown={onKeyDown}
      onMouseEnter={() => updateScrolling('hovered', true)}
      onMouseLeave={() => updateScrolling('hovered', false)}
      onFocus={() => updateScrolling('focused', true)}
      onBlur={() => updateScrolling('focused', false)}
      className={({ isActive }) =>
        `group/filetree-link flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-[5px] text-[13px] leading-[18px] outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring ${isActive ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : ''}`
      }
    >
      <Icon aria-hidden={true} className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate motion-safe:group-hover/filetree-link:text-clip motion-safe:group-focus-visible/filetree-link:text-clip">
        <span ref={label} className="inline-block whitespace-nowrap">
          <span className="text-muted-foreground">{node.code}</span> {node.name}
        </span>
      </span>
    </NavLink>
  )
}
