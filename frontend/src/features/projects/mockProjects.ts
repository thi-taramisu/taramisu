export type Project = {
  id: string
  name: string
  description: string
  favorite: boolean
  owner: string
  updatedAt: string
}

export const mockProjects: Project[] = [
  {
    id: 'battery-security',
    name: 'Battery Security',
    description: 'Battery system TARA',
    favorite: true,
    owner: 'Demo User',
    updatedAt: '2026-10-19',
  },
  {
    id: 'headlamp',
    name: 'Headlamp System',
    description: 'Headlamp cybersecurity analysis',
    favorite: true,
    owner: 'Demo User',
    updatedAt: '2026-10-18',
  },
  {
    id: 'vehicle-gateway',
    name: 'Vehicle Gateway',
    description: 'Gateway threat analysis',
    favorite: false,
    owner: 'Demo User',
    updatedAt: '2026-10-16',
  },
]
