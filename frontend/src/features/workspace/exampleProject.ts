import type { EntityType } from './entities'

// Hard-coded example project (headlamp system) for the sidebar tree, until the backend has the data.

export interface TreeNode {
  type: EntityType
  id: string
  code: string
  name: string
  children?: TreeNode[]
}

export const exampleProject = {
  id: 'headlamp',
  name: 'Headlamp system (example)',
  tree: [
    {
      type: 'items',
      id: 'i-01',
      code: 'I-01',
      name: 'Headlamp system',
      children: [
        {
          type: 'assets',
          id: 'a-01',
          code: 'A-01',
          name: 'Headlamp on/off command',
          children: [
            {
              type: 'damage-scenarios',
              id: 'ds-01',
              code: 'DS-01',
              name: 'Headlamp turns off while driving at night',
              children: [
                {
                  type: 'threat-scenarios',
                  id: 'ts-01',
                  code: 'TS-01',
                  name: 'Spoofed headlamp command on the CAN bus',
                  children: [
                    { type: 'attack-paths', id: 'ap-01', code: 'AP-01', name: 'Compromised navigation ECU via cellular' },
                    { type: 'attack-paths', id: 'ap-02', code: 'AP-02', name: 'Malicious device on the OBD-II connector' },
                  ],
                },
              ],
            },
          ],
        },
        { type: 'assets', id: 'a-02', code: 'A-02', name: 'Body control ECU firmware' },
        { type: 'assets', id: 'a-03', code: 'A-03', name: 'Camera image data' },
        { type: 'assets', id: 'a-04', code: 'A-04', name: 'Diagnostic session key' },
      ],
    },
  ] satisfies TreeNode[] as TreeNode[],
}

export function findNode(type: EntityType, id: string, nodes = exampleProject.tree): TreeNode | undefined {
  for (const node of nodes) {
    if (node.type === type && node.id === id) return node
    const found = node.children && findNode(type, id, node.children)
    if (found) return found
  }
  return undefined
}
