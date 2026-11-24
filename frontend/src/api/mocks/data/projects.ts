import type { Project } from '../../models/project'

// MOCK DATA: the project list of the mock project API (`../mockProjectApi.ts`). The current user owns every project.

export const mockProjects: Project[] = [
  {
    id: 'battery-security',
    name: 'Battery Security',
    description: 'Battery system TARA',
    favorite: true,
    archived: false,
    role: 'OWNER',
    owner: 'Demo User',
    updatedAt: '2026-10-19',
  },
  {
    id: 'headlamp',
    name: 'Headlamp System',
    description: 'Headlamp cybersecurity analysis',
    favorite: true,
    archived: false,
    role: 'OWNER',
    owner: 'Demo User',
    updatedAt: '2026-10-18',
  },
  {
    id: 'vehicle-gateway',
    name: 'Vehicle Gateway',
    description: 'Gateway threat analysis',
    favorite: false,
    archived: false,
    role: 'OWNER',
    owner: 'Demo User',
    updatedAt: '2026-10-16',
  },
]
