import type { Member } from '../../models/project'

// MOCK DATA: members of the headlamp system, until the frontend uses the member endpoints (#249).

export const headlampMembers: Member[] = [
  { id: 'm-01', email: 'alex@example.com', role: 'OWNER', added: '2026-01-01' },
  { id: 'm-02', email: 'sam@example.com', role: 'EDITOR', added: '2026-01-01' },
  { id: 'm-03', email: 'kim@example.com', role: 'VIEWER', added: '2026-10-10' },
]
