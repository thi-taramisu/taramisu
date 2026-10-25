import { useState } from 'react'
import { CircleX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AddMemberDialog } from './AddMemberDialog'
import { headlampMembers, type Member, PROJECT_ROLES, type ProjectRole } from './headlampSettings'
import { RemoveMemberDialog } from './RemoveMemberDialog'

// Fixed locale and time zone, so dates match the English UI and do not shift between machines.
const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeZone: 'UTC' })

export function MembersSettings() {
  const [members, setMembers] = useState<Member[]>(headlampMembers)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)

  function changeRole(id: string, role: ProjectRole) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)))
  }

  function remove(member: Member) {
    setMembers((prev) => prev.filter((m) => m.id !== member.id))
    setMemberToRemove(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Members</h2>
        <AddMemberDialog
          onAdd={(member) =>
            setMembers((prev) => [...prev, { ...member, id: crypto.randomUUID(), added: new Date().toISOString().slice(0, 10) }])
          }
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Added</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="font-medium">{member.email}</TableCell>
              <TableCell>
                <NativeSelect
                  aria-label={`Role for ${member.email}`}
                  value={member.role}
                  onChange={(event) => changeRole(member.id, event.target.value as ProjectRole)}
                >
                  {PROJECT_ROLES.map(({ value, label }) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </TableCell>
              <TableCell>{dateFormat.format(new Date(member.added))}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" aria-label={`Remove ${member.email}`} onClick={() => setMemberToRemove(member)}>
                  <CircleX aria-hidden="true" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <RemoveMemberDialog member={memberToRemove} onCancel={() => setMemberToRemove(null)} onConfirm={remove} />
    </div>
  )
}
