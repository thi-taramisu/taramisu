import { describe, expect, it } from 'vitest'
import { BOUNDARY_ID, headlampEdges, headlampNodes } from './headlampExample'

describe('headlamp example data', () => {
  it('has unique node ids', () => {
    const ids = headlampNodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only has edges between existing nodes', () => {
    const ids = new Set(headlampNodes.map((n) => n.id))
    for (const edge of headlampEdges) {
      expect(ids.has(edge.source), `${edge.id}: unknown source ${edge.source}`).toBe(true)
      expect(ids.has(edge.target), `${edge.id}: unknown target ${edge.target}`).toBe(true)
    }
  })

  it('puts exactly the headlamp system inside the item boundary', () => {
    const inside = headlampNodes.filter((n) => n.parentId === BOUNDARY_ID).map((n) => n.id)
    expect(inside.sort()).toEqual(
      [
        'body-control-ecu',
        'camera-ecu',
        'headlamp-switch',
        'led-left',
        'led-right',
        'power-switch-actuator',
      ].sort(),
    )
  })

  it('lists parent nodes before their children', () => {
    const index = new Map(headlampNodes.map((n, i) => [n.id, i]))
    for (const node of headlampNodes) {
      if (node.parentId) {
        expect(index.get(node.parentId)!).toBeLessThan(index.get(node.id)!)
      }
    }
  })
})
