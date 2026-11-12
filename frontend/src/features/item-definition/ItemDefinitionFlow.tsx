import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTheme } from '../theme/theme'
import { headlampEdges, headlampNodes } from './headlampExample'

type AreaData = { label: string; variant: 'environment' | 'boundary' }

// Group node used for the operational environment and the item boundary.
function AreaNode({ data }: NodeProps<Node<AreaData>>) {
  const isBoundary = data.variant === 'boundary'
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        border: isBoundary ? '2px dashed var(--entity-item-border)' : '1px dashed var(--border)',
        background: isBoundary ? 'var(--entity-item)' : 'var(--muted)',
        color: isBoundary ? 'var(--entity-item-foreground)' : 'var(--foreground)',
        borderRadius: 4,
      }}
    >
      <span style={{ position: 'absolute', top: 6, left: 10, fontSize: 12, fontWeight: 600 }}>
        {data.label}
      </span>
    </div>
  )
}

const SIDES = [
  [Position.Top, 'top'],
  [Position.Right, 'right'],
  [Position.Bottom, 'bottom'],
  [Position.Left, 'left'],
] as const

// A system component with a connection point on every side. In loose connection
// mode any handle can start or end a connection.
function ComponentNode({ data }: NodeProps<Node<{ label: string }>>) {
  return (
    <div
      style={{
        padding: '10px 16px',
        border: '1px solid var(--border)',
        borderRadius: 4,
        background: 'var(--card)',
        color: 'var(--card-foreground)',
        fontSize: 13,
        textAlign: 'center',
      }}
    >
      {data.label}
      {SIDES.map(([position, id]) => (
        <Handle key={id} id={id} type="source" position={position} />
      ))}
    </div>
  )
}

const nodeTypes: NodeTypes = { area: AreaNode, component: ComponentNode }

export function ItemDefinitionFlow() {
  const theme = useTheme()
  const [nodes, , onNodesChange] = useNodesState(headlampNodes)
  const [edges, , onEdgesChange] = useEdgesState(headlampEdges)

  return (
    <ReactFlow
      colorMode={theme}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      connectionMode={ConnectionMode.Loose}
      defaultEdgeOptions={{ type: 'smoothstep' }}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  )
}
