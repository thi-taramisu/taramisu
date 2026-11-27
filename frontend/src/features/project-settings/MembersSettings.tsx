import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { CircleX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AddMemberDialog } from './AddMemberDialog'
import { headlampMembers } from '../../api/mocks/data/projectSettings'
import type { Member, ProjectRole } from '../../api/models/project'
import { PROJECT_ROLES } from './roles'
import { RemoveMemberDialog } from './RemoveMemberDialog'

function isLastOwner(member: Member, members: Member[]) {
  return member.role === 'OWNER' && members.filter((m) => m.role === 'OWNER').length === 1
}

export function MembersSettings() {
  const { t } = useTranslation()
  const [members, setMembers] = useState<Member[]>(headlampMembers)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)

  function changeRole(id: string, role: ProjectRole) {
    setMembers((prev) => prev.map((m) => (m.id === id && !isLastOwner(m, prev) ? { ...m, role } : m)))
  }

  function remove(member: Member) {
    setMembers((prev) => (isLastOwner(member, prev) ? prev : prev.filter((m) => m.id !== member.id)))
    setMemberToRemove(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">{t('navigation.members')}</h1>
        <AddMemberDialog
          onAdd={(member) =>
            setMembers((prev) => [...prev, { ...member, id: crypto.randomUUID(), added: new Date().toISOString().slice(0, 10) }])
          }
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('ui:member')}</TableHead>
            <TableHead>{t('ui:role')}</TableHead>
            <TableHead>{t('ui:added')}</TableHead>
            <TableHead>
              <span className="sr-only">{t('ui:actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="font-medium">{member.email}</TableCell>
              <TableCell>
                <NativeSelect
                  aria-label={t('ui:memberRole', { email: member.email })}
                  value={member.role}
                  disabled={isLastOwner(member, members)}
                  onChange={(event) => changeRole(member.id, event.target.value as ProjectRole)}
                >
                  {PROJECT_ROLES.map(({ value, label }) => (
                    <NativeSelectOption key={value} value={value}>
                      {t(label)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </TableCell>
              <TableCell>
                <time dateTime={member.added}>{member.added}</time>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('ui:removeNamed', { name: member.email })}
                  disabled={isLastOwner(member, members)}
                  onClick={() => setMemberToRemove(member)}
                >
                  <CircleX aria-hidden="true" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">{t('ui:ownerRequired')}</p>
      <RemoveMemberDialog member={memberToRemove} onCancel={() => setMemberToRemove(null)} onConfirm={remove} />
    </div>
  )
}
