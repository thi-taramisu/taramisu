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
        border: isBoundary ? '2px dashed #d33' : '1px dashed #888',
        background: isBoundary ? 'rgba(221, 51, 51, 0.05)' : 'rgba(128, 128, 128, 0.08)',
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
        border: '1px solid #222',
        borderRadius: 4,
        background: '#fff',
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
  const [nodes, , onNodesChange] = useNodesState(headlampNodes)
  const [edges, , onEdgesChange] = useEdgesState(headlampEdges)

  return (
    <ReactFlow
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
