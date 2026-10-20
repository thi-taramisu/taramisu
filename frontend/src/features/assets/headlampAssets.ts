// Example assets for the headlamp system, hard-coded until the backend has an assets endpoint.

export type CiaProperty = 'C' | 'I' | 'A'

export interface Asset {
  id: string
  name: string
  component: string
  properties: CiaProperty[]
}

export const headlampAssets: Asset[] = [
  { id: 'a1', name: 'Headlamp on/off command', component: 'Body control ECU', properties: ['I', 'A'] },
  { id: 'a2', name: 'Body control ECU firmware', component: 'Body control ECU', properties: ['I'] },
  { id: 'a3', name: 'Camera image data', component: 'Camera ECU', properties: ['I', 'A'] },
  { id: 'a4', name: 'Diagnostic session key', component: 'Gateway ECU', properties: ['C', 'I'] },
]
