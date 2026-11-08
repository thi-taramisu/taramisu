import type { Project } from '../../models/project'

// MOCK DATA: the project list, until the project CRUD routes (#81) exist.

export const mockProjects: Project[] = [
  {
    id: 'battery-security',
    name: 'Battery Security',
    description: 'Battery system TARA',
    favorite: true,
    archived: false,
    owner: 'Demo User',
    updatedAt: '2026-10-19',
  },
  {
    id: 'headlamp',
    name: 'Headlamp System',
    description: 'Headlamp cybersecurity analysis',
    favorite: true,
    archived: false,
    owner: 'Demo User',
    updatedAt: '2026-10-18',
  },
  {
    id: 'vehicle-gateway',
    name: 'Vehicle Gateway',
    description: 'Gateway threat analysis',
    favorite: false,
    archived: false,
    owner: 'Demo User',
    updatedAt: '2026-10-16',
  },
]
