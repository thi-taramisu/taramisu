import { exampleProject } from '../workspace/exampleProject'

// Example settings for the headlamp system, hard-coded until the backend has an settings endpoint.

export type ProjectRole = 'OWNER' | 'EDITOR' | 'REVIEWER' | 'VIEWER'

export const PROJECT_ROLES: { value: ProjectRole; label: string }[] = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'REVIEWER', label: 'Reviewer' },
  { value: 'VIEWER', label: 'Viewer' },
]

export interface Member {
  email: string
  role: ProjectRole
  added: string
}

export interface ProjectDetails {
  name: string
  description: string
}

export const headlampDetails: ProjectDetails = {
  name: exampleProject.name,
  description: 'TARA of the headlamp system, the example project of the course.',
}

export const headlampMembers: Member[] = [
  { email: 'alex@example.com', role: 'OWNER', added: '2026-01-01' },
  { email: 'sam@example.com', role: 'EDITOR', added: '2026-01-01' },
  { email: 'kim@example.com', role: 'VIEWER', added: '2026-10-10' },
]
