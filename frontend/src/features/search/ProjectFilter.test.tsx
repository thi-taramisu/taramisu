import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '../../i18n'
import type { SearchProject } from '../../api/models/search'
import { ProjectFilter } from './ProjectFilter'

const projects: SearchProject[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `project-${String(index).padStart(4, '0')}`,
  name: `Fleet project ${String(index).padStart(4, '0')}`,
}))

function ControlledPicker({ entries, onChange }: { entries: SearchProject[]; onChange: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>([])
  return <ProjectFilter projects={entries} selectedIds={ids} onChange={(next) => { setIds(next); onChange(next) }} />
}

async function openPicker(entries = projects) {
  const user = userEvent.setup()
  const onChange = vi.fn<(ids: string[]) => void>()
  render(<ControlledPicker entries={entries} onChange={onChange} />)
  await user.click(screen.getByRole('button', { name: 'Filter by project' }))
  const input = screen.getByRole('combobox', { name: 'Search projects' })
  const list = within(screen.getByRole('listbox', { name: 'Project filters' }))
  return { user, input, list, onChange }
}

describe('searchable project filter', () => {
  it('finds a project in a directory of 1000 without rendering every option or opening a modal', async () => {
    const { user, input, list, onChange } = await openPicker()
    expect(input).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(list.getAllByRole('option')).toHaveLength(50)
    expect(screen.getByText('50 of 1,000 projects')).toBeInTheDocument()

    await user.type(input, 'FLEET 0999')
    expect(list.getAllByRole('option')).toHaveLength(1)
    expect(onChange).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['project-0999'])
    expect(list.getByRole('option', { name: 'Fleet project 0999 (project-0999)' })).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveFocus()
  })

  it('supports multiple choices, deselection and lookup by project ID', async () => {
    const { user, input, list, onChange } = await openPicker()
    await user.type(input, 'PROJECT-0789')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['project-0789'])

    await user.clear(input)
    await user.type(input, '0123')
    await user.click(list.getByRole('option', { name: /Fleet project 0123/ }))
    expect(onChange).toHaveBeenLastCalledWith(['project-0789', 'project-0123'])
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['project-0789'])
    expect(list.getByRole('option', { name: /Fleet project 0123/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('shows an empty state and clears only the project lookup', async () => {
    const { user, input, list } = await openPicker()
    await user.type(input, 'Missing project')
    expect(list.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('No projects found.')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Clear project search' }))
    expect(input).toHaveFocus()
    expect(input).toHaveValue('')
    expect(list.getAllByRole('option')).toHaveLength(50)
  })

  it('lets users browse more matches and resets the lookup when reopened', async () => {
    const { user, input, list } = await openPicker()
    await user.click(screen.getByRole('button', { name: 'Show more projects' }))
    expect(input).toHaveFocus()
    expect(list.getAllByRole('option')).toHaveLength(100)
    await user.type(input, '0999')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Filter by project' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Filter by project' }))
    expect(screen.getByRole('combobox', { name: 'Search projects' })).toHaveValue('')
    expect(screen.getAllByRole('option')).toHaveLength(50)
  })

  it('keeps keyboard navigation working across the rendered page boundary', async () => {
    const { user, input, list } = await openPicker()
    await user.keyboard('{ArrowDown>55/}')
    expect(list.getAllByRole('option')).toHaveLength(100)
    const active = list.getByRole('option', { name: 'Fleet project 0055 (project-0055)' })
    expect(input).toHaveAttribute('aria-activedescendant', active.id)
    await user.keyboard('{ArrowUp}{Enter}')
    expect(list.getByRole('option', { name: /Fleet project 0054/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('does not offer projects while no accessible directory is available', () => {
    render(<ProjectFilter projects={[]} selectedIds={[]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Filter by project' })).toBeDisabled()
  })

  it('translates the picker and formats counts for German without changing project names', async () => {
    await i18n.changeLanguage('de')
    const user = userEvent.setup()
    const onChange = vi.fn<(ids: string[]) => void>()
    render(<ControlledPicker entries={projects} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Nach Projekt filtern' }))
    const input = screen.getByRole('combobox', { name: 'Projekte suchen' })
    expect(input).toHaveFocus()
    expect(screen.getByText('50 von 1.000 Projekten')).toBeInTheDocument()

    await user.type(input, '0999')
    const option = screen.getByRole('option', { name: 'Fleet project 0999 (project-0999)' })
    await user.keyboard('{Enter}')
    expect(option).toHaveAttribute('aria-selected', 'true')
    expect(onChange).toHaveBeenLastCalledWith(['project-0999'])
    expect(screen.getByText('1 von 1 Projekt')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Nach Projekt filtern' })).toHaveFocus()
  })
})
