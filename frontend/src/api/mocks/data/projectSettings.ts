import type { Member, ProjectDetails } from '../../models/project'
import { exampleProject } from './headlamp'

// MOCK DATA: settings of the headlamp system, until the backend has a settings endpoint.

export const headlampDetails: ProjectDetails = {
  name: exampleProject.name,
  description: 'TARA of the headlamp system, the example project of the course.',
}

export const headlampMembers: Member[] = [
  { id: 'm-01', email: 'alex@example.com', role: 'OWNER', added: '2026-01-01' },
  { id: 'm-02', email: 'sam@example.com', role: 'EDITOR', added: '2026-01-01' },
  { id: 'm-03', email: 'kim@example.com', role: 'VIEWER', added: '2026-10-10' },
]
