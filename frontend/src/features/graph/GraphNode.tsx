import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { AlertTriangle, Box, GitBranch, Layers, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENTITY_TYPES } from '../workspace/entities'
import type { GraphElement } from './graphModel'

import { riskClasses, riskText } from './riskStyles'

export type RelationNode = Node<{
  element: GraphElement
  minimal: boolean
  active: boolean
  inspect: (key: string) => void
}, 'relation'>
const ICONS = { items: Layers, assets: Box, 'damage-scenarios': AlertTriangle, 'threat-scenarios': Zap, 'attack-paths': GitBranch }

export function GraphNode({ data }: NodeProps<RelationNode>) {
  const { element, minimal, active, inspect } = data
  const Icon = ICONS[element.type]
  return (
    <div>
      {[Position.Left, Position.Right, Position.Top, Position.Bottom].map((position) => (
        <Handle key={position} id={position} position={position} type="source" className="opacity-0" isConnectable={false} />
      ))}
      <button
        type="button"
        className={cn(
          'nopan cursor-grab active:cursor-grabbing touch-none flex min-h-20 w-56 items-center gap-3 rounded-[2rem] border-2 px-4 py-3 text-left shadow-sm',
          'outline-none focus-visible:ring-4 focus-visible:ring-ring/60',
          riskClasses[element.risk ?? 0] ?? 'border-rating-unknown-border bg-rating-unknown text-rating-unknown-foreground',
          active && 'ring-2 ring-foreground/50 ring-offset-4 ring-offset-background',
        )}
        aria-label={`${ENTITY_TYPES[element.type].label} ${element.code ?? ''} ${element.name}, ${riskText(element.risk)}`}
        aria-pressed={active}
        onClick={() => inspect(element.key)}
      >
        <Icon aria-hidden="true" className="size-7 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-medium uppercase tracking-wider opacity-75">{ENTITY_TYPES[element.type].label}</span>
          <span className="block text-sm font-semibold">{element.code ?? (minimal ? element.name : '')}</span>
          {!minimal && <span className="block text-xs leading-snug">{element.name}</span>}
          <span className="mt-1 block text-[10px] font-medium opacity-80">{riskText(element.risk)}</span>
        </span>
      </button>
    </div>
  )
}
