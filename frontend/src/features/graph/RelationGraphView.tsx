import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { MarkerType, type Edge, type XYPosition } from '@xyflow/react'
import { ArrowRight, Expand, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ENTITY_TYPES, entityPath } from '../workspace/entities'
import { elementKey, graphNeighborhood, type GraphElement } from './graphModel'
import type { RelationNode } from './GraphNode'
import { GraphCanvas } from './GraphCanvas'
import { riskClasses, riskStroke, riskText } from './riskStyles'
import { useRelationGraph } from './useRelationGraph'
import '@xyflow/react/dist/style.css'

/** Local graph prototype: the query string carries focus and display mode through tree navigation. */
export function RelationGraphView({ type }: { type: GraphElement['type'] }) {
  const { projectId = '', entityId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const minimal = params.get('graphMode') === 'minimal'
  const focus = elementKey(type, entityId)
  const [selected, setSelected] = useState<{ focus: string; key: string } | null>(null)
  const [fitVersion, setFitVersion] = useState(0)
  const layoutKey = `${projectId}:${focus}`
  const [layouts, setLayouts] = useState<Record<string, Record<string, XYPosition>>>({})
  const graph = useRelationGraph(projectId)

  if (!graph.data) {
    if (graph.isError) return (
      <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-6">
        <p>The graph could not be loaded. Relations may be incomplete.</p>
        <Button variant="outline" onClick={() => void graph.refetch()}>Retry</Button>
      </div>
    )
    return <output>Loading graph…</output>
  }
  const visible = graphNeighborhood(graph.data, focus)
  const active = visible.elements.find((element) => element.key === focus)
  if (!active) return <p className="rounded-lg border border-dashed p-6 text-muted-foreground">No graph data for this element.</p>

  const connected = visible.elements.filter((element) => element.key !== focus)
  // Match the threat-centered wireframe; other elements keep parents left and consequences right.
  const left = connected.filter((element) => type === 'threat-scenarios'
    ? element.type === 'attack-paths'
    : visible.relations.some((edge) => edge.source === element.key && edge.target === focus))
  const top = connected.filter((element) => type === 'threat-scenarios' && element.type === 'assets')
  const right = connected.filter((element) => !left.includes(element) && !top.includes(element))
  const rows = Math.max(left.length, right.length, 1)
  const centerY = 150 + (rows - 1) * 75
  const positions = new Map([[focus, { x: 380, y: centerY }]])
  for (const [column, x] of [[left, 40], [right, 720]] as const) {
    column.forEach((element, i) => positions.set(element.key, { x, y: centerY + (i - (column.length - 1) / 2) * 150 }))
  }
  top.forEach((element, i) => positions.set(element.key, { x: 380 + i * 270, y: 0 }))
  // Ports belong to the initial semantic layout. Dragging changes coordinates, never connection sides.
  const portPositions = new Map(positions)
  for (const element of visible.elements) {
    const moved = layouts[layoutKey]?.[element.key]
    if (moved) positions.set(element.key, moved)
  }
  const nodes: RelationNode[] = visible.elements.map((element) => ({
    id: element.key,
    type: 'relation',
    position: positions.get(element.key)!,
    data: { element, minimal, active: element.key === focus, inspect: (key) => setSelected({ focus, key }) },
  }))
  const edges: Edge[] = visible.relations.map((relation) => {
    const start = portPositions.get(relation.source)!
    const end = portPositions.get(relation.target)!
    const vertical = start.x === end.x
    const color = riskStroke(relation.risk)
    return {
      ...relation,
      sourceHandle: vertical ? (start.y < end.y ? 'bottom' : 'top') : (start.x < end.x ? 'right' : 'left'),
      targetHandle: vertical ? (start.y < end.y ? 'top' : 'bottom') : (start.x < end.x ? 'left' : 'right'),
      type: 'smoothstep',
      label: riskText(relation.risk),
      style: { stroke: color, strokeWidth: 2, strokeDasharray: relation.risk === null ? '5 5' : undefined },
      labelStyle: { fill: 'var(--foreground)', fontSize: 10 },
      labelBgStyle: { fill: 'var(--background)' },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    }
  })
  const inspected = selected?.focus === focus ? visible.elements.find((element) => element.key === selected.key) : undefined
  const related = inspected ? graph.data.elements.filter((element) => graph.data.relations.some((relation) =>
    (relation.source === inspected.key && relation.target === element.key) || (relation.target === inspected.key && relation.source === element.key),
  )) : []
  function destination(element: GraphElement, editing = false) {
    const next = new URLSearchParams(params)
    if (editing) { next.delete('view'); next.delete('graphMode') }
    else next.set('view', 'graph')
    return `${entityPath(projectId, element.type, element.id)}${next.size ? `?${next}` : ''}`
  }

  return (
    <section aria-label="Relation graph" className="flex min-h-[600px] flex-1 flex-col overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Relations</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${riskClasses[active.risk ?? 0] ?? 'text-muted-foreground'}`}>
            {riskText(active.risk)}{active.risk !== null && ' · highest related'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Switch id="graph-minimal" checked={minimal} onCheckedChange={(checked) => {
            const next = new URLSearchParams(params)
            if (checked) next.set('graphMode', 'minimal')
            else next.delete('graphMode')
            setParams(next, { replace: true })
          }} />
          <Label htmlFor="graph-minimal">Minimal view</Label>
          <Button variant="ghost" size="sm" aria-label="Reset graph layout" onClick={() => {
            setLayouts((previous) => ({ ...previous, [layoutKey]: {} }))
            setFitVersion((value) => value + 1)
          }}><RotateCcw aria-hidden="true" />Reset layout</Button>
          <Button variant="ghost" size="icon-sm" aria-label="Fit graph" onClick={() => setFitVersion((value) => value + 1)}><Expand aria-hidden="true" /></Button>
        </div>
      </div>
      <div className="relative min-h-[480px] flex-1" style={{ height: 'min(65vh, 720px)' }}>
        <GraphCanvas
          key={`${focus}:${fitVersion}`}
          nodes={nodes}
          edges={edges}
          onMove={(id, position) => setLayouts((previous) => ({
            ...previous,
            [layoutKey]: { ...previous[layoutKey], [id]: position },
          }))}
          onClearSelection={() => setSelected(null)}
        />
        {inspected && (
          <aside aria-label="Selected graph element" className="absolute top-3 right-3 z-10 w-72 max-w-[calc(100%-1.5rem)] rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{ENTITY_TYPES[inspected.type].label} · {inspected.code}</p>
                <h2 className="mt-1 text-sm font-semibold">{inspected.name}</h2>
              </div>
              <Button variant="ghost" size="icon-xs" aria-label="Close element details" onClick={() => setSelected(null)}><X aria-hidden="true" /></Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{riskText(inspected.risk)}{inspected.risk !== null && ' · highest related risk'}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" asChild><Link to={destination(inspected, true)}>Edit</Link></Button>
              <Button size="sm" asChild><Link to={destination(inspected)}>Jump to <ArrowRight aria-hidden="true" /></Link></Button>
            </div>
            <p className="mt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Related to</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {related.map((element) => (
                <Link key={element.key} to={destination(element)} className="rounded-full border bg-muted px-2 py-1 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" title={element.name}>
                  {element.code ?? element.name}
                </Link>
              ))}
              {related.length === 0 && <span className="text-xs text-muted-foreground">No linked elements.</span>}
            </div>
          </aside>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 text-[11px] text-muted-foreground">
        <span>Mock data · Drag nodes to arrange · Click for details</span>
        {[1, 2, 3, 4, 5].map((risk) => <span key={risk} className="flex items-center gap-1"><span className={`size-2.5 rounded-full border ${riskClasses[risk]}`} />Risk {risk}</span>)}
        <span>Dashed = not rated</span>
      </div>
    </section>
  )
}
