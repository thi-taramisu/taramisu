import type { ProjectRole } from '../../api/models/project'

export const PROJECT_ROLES: { value: ProjectRole; label: string }[] = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'REVIEWER', label: 'Reviewer' },
  { value: 'VIEWER', label: 'Viewer' },
]

/** New members start with the fewest rights. */
export const DEFAULT_PROJECT_ROLE: ProjectRole = 'VIEWER'
