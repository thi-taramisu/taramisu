import type { Edge, Node } from '@xyflow/react'

// Item definition example "headlamp system" (ISO/SAE 21434), see course slides.
// Child positions are relative to their parent group node.
// Parent nodes must come before their children in the array.

export const ENVIRONMENT_ID = 'environment'
export const BOUNDARY_ID = 'item-boundary'

function component(id: string, parentId: string, x: number, y: number, label: string): Node {
  return { id, type: 'component', parentId, position: { x, y }, data: { label } }
}

export const headlampNodes: Node[] = [
  {
    id: ENVIRONMENT_ID,
    type: 'area',
    position: { x: 0, y: 0 },
    data: { label: 'Operational environment', variant: 'environment' },
    style: { width: 1040, height: 660 },
  },
  {
    id: BOUNDARY_ID,
    type: 'area',
    parentId: ENVIRONMENT_ID,
    position: { x: 20, y: 340 },
    data: { label: 'Item boundary: Headlamp system', variant: 'boundary' },
    style: { width: 1000, height: 300 },
  },

  // Operational environment
  component('cellular', ENVIRONMENT_ID, 260, 40, 'Cellular'),
  component('bluetooth', ENVIRONMENT_ID, 560, 40, 'Bluetooth'),
  component('navigation-ecu', ENVIRONMENT_ID, 410, 130, 'Navigation ECU'),
  component('gateway-ecu', ENVIRONMENT_ID, 410, 230, 'Gateway ECU'),
  component('obd-ii', ENVIRONMENT_ID, 800, 230, 'OBD-II connector'),
  component('other-ecus', ENVIRONMENT_ID, 40, 230, 'Other ECUs'),

  // Inside the item boundary
  component('headlamp-switch', BOUNDARY_ID, 20, 200, 'Headlamp switch'),
  component('body-control-ecu', BOUNDARY_ID, 210, 200, 'Body control ECU'),
  component('camera-ecu', BOUNDARY_ID, 620, 60, 'Camera ECU'),
  component('power-switch-actuator', BOUNDARY_ID, 620, 200, 'Power switch actuator'),
  component('led-left', BOUNDARY_ID, 860, 160, 'LED left'),
  component('led-right', BOUNDARY_ID, 860, 235, 'LED right'),
]

export const headlampEdges: Edge[] = [
  { id: 'e-cellular-nav', source: 'cellular', sourceHandle: 'bottom', target: 'navigation-ecu', targetHandle: 'top' },
  { id: 'e-bluetooth-nav', source: 'bluetooth', sourceHandle: 'bottom', target: 'navigation-ecu', targetHandle: 'top' },
  { id: 'e-nav-gateway', source: 'navigation-ecu', sourceHandle: 'bottom', target: 'gateway-ecu', targetHandle: 'top' },
  { id: 'e-other-gateway', source: 'other-ecus', sourceHandle: 'right', target: 'gateway-ecu', targetHandle: 'left' },
  { id: 'e-gateway-obd', source: 'gateway-ecu', sourceHandle: 'right', target: 'obd-ii', targetHandle: 'left' },
  {
    id: 'e-gateway-body',
    source: 'gateway-ecu',
    sourceHandle: 'bottom',
    target: 'body-control-ecu',
    targetHandle: 'top',
    label: 'CAN',
  },
  {
    id: 'e-gateway-camera',
    source: 'gateway-ecu',
    sourceHandle: 'bottom',
    target: 'camera-ecu',
    targetHandle: 'top',
    label: 'CAN',
  },
  { id: 'e-switch-body', source: 'headlamp-switch', sourceHandle: 'right', target: 'body-control-ecu', targetHandle: 'left' },
  {
    id: 'e-body-actuator',
    source: 'body-control-ecu',
    sourceHandle: 'right',
    target: 'power-switch-actuator',
    targetHandle: 'left',
    label: 'Lamp request (low, high, off)',
  },
  {
    id: 'e-camera-actuator',
    source: 'camera-ecu',
    sourceHandle: 'bottom',
    target: 'power-switch-actuator',
    targetHandle: 'top',
    label: 'Oncoming car information (yes or no)',
  },
  { id: 'e-actuator-led-left', source: 'power-switch-actuator', sourceHandle: 'right', target: 'led-left', targetHandle: 'left' },
  { id: 'e-actuator-led-right', source: 'power-switch-actuator', sourceHandle: 'right', target: 'led-right', targetHandle: 'left' },
]
