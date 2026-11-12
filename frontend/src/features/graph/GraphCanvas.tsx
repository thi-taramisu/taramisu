import { useEffect } from 'react'
import { Background, ConnectionMode, Controls, ReactFlow, useNodesState, type Edge, type XYPosition } from '@xyflow/react'
import { GraphNode, type RelationNode } from './GraphNode'

const nodeTypes = { relation: GraphNode }

/** Keep the high-frequency drag updates inside the canvas, preserving React Flow's dragging state. */
export function GraphCanvas({ nodes: initialNodes, edges, onMove, onClearSelection }: {
  nodes: RelationNode[]
  edges: Edge[]
  onMove: (id: string, position: XYPosition) => void
  onClearSelection: () => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  // Changes from navigation, display mode, or mock data update labels and saved positions.
  // Pointer movement only uses onNodesChange and does not rebuild the parent graph.
  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, node) => onMove(node.id, node.position)}
      nodeTypes={nodeTypes}
      connectionMode={ConnectionMode.Loose}
      fitView
      fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
      nodesDraggable
      nodeDragThreshold={4}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      minZoom={0.25}
      maxZoom={1.6}
      onPaneClick={onClearSelection}
    >
      <Background color="var(--border)" gap={24} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
