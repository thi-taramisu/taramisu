import type { ProjectRole } from '../../api/models/project'

export const PROJECT_ROLES: { value: ProjectRole; label: string }[] = [
  { value: 'OWNER', label: 'ui:owner' },
  { value: 'EDITOR', label: 'ui:editor' },
  { value: 'REVIEWER', label: 'ui:reviewer' },
  { value: 'VIEWER', label: 'ui:viewer' },
]

/** New members start with the fewest rights. */
export const DEFAULT_PROJECT_ROLE: ProjectRole = 'VIEWER'
