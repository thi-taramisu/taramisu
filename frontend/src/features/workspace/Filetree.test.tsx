import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Filetree } from './Filetree'
import type { TreeNode } from './entities'

const project = '/projects/test-project'
const nodes: TreeNode[] = [
  {
    type: 'items', id: 'i-01', code: 'I-01', name: 'Headlamp', children: [
      {
        type: 'assets', id: 'a-01', code: 'A-01', name: 'Long asset name', children: [
          { type: 'damage-scenarios', id: 'ds-01', code: 'DS-01', name: 'Loss of light' },
        ],
      },
      { type: 'assets', id: 'a-02', code: 'A-02', name: 'Firmware', children: [] },
    ],
  },
]

function renderTree(path = project, tree = nodes) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <nav aria-label="Project elements"><Filetree projectId="test-project" nodes={tree} /></nav>
      <Link to={`${project}/damage-scenarios/ds-01/impact`}>Open impact externally</Link>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Filetree', () => {
  it('uses the supplied project and keeps the active entity on its tabs and in graph view', async () => {
    const user = userEvent.setup()
    renderTree(`${project}/assets/a-01/risks?view=graph&filter=open`)

    const asset = screen.getByRole('link', { name: 'A-01 Long asset name' })
    expect(asset).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'I-01 Headlamp' })).not.toHaveAttribute('aria-current')
    const damage = screen.getByRole('link', { name: 'DS-01 Loss of light' })
    expect(damage).toHaveAttribute('href', `${project}/damage-scenarios/ds-01?view=graph&filter=open`)

    await user.click(damage)
    expect(damage).toHaveAttribute('aria-current', 'page')
    expect(asset).not.toHaveAttribute('aria-current')
  })

  it('toggles branches with the keyboard and retains nested expansion choices', async () => {
    const user = userEvent.setup()
    renderTree()

    await user.tab()
    const initialToggle = screen.getByRole('button', { name: 'Collapse I-01 Headlamp' })
    const content = document.getElementById(initialToggle.getAttribute('aria-controls')!)
    expect(initialToggle).toHaveFocus()
    await user.keyboard(' ')
    const rootToggle = screen.getByRole('button', { name: 'Expand I-01 Headlamp' })
    expect(rootToggle).toHaveAttribute('aria-expanded', 'false')
    expect(content).not.toBeVisible()
    expect(screen.queryByRole('link', { name: /A-01/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'I-01 Headlamp' })).not.toHaveAttribute('aria-current')

    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Collapse A-01 Long asset name' }))
    await user.click(screen.getByRole('button', { name: 'Collapse I-01 Headlamp' }))
    await user.click(screen.getByRole('button', { name: 'Expand I-01 Headlamp' }))
    expect(screen.getByRole('button', { name: 'Expand A-01 Long asset name' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /DS-01/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /A-02/ })).not.toBeInTheDocument()
  })

  it('moves between visible entries with arrows, Home and End', async () => {
    const user = userEvent.setup()
    renderTree()
    const root = screen.getByRole('link', { name: 'I-01 Headlamp' })
    root.focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('link', { name: 'A-01 Long asset name' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: 'Expand A-01 Long asset name' })).toBeInTheDocument()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('link', { name: 'A-02 Firmware' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(root).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('link', { name: 'A-02 Firmware' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('link', { name: 'A-01 Long asset name' })).toHaveFocus()
    await user.keyboard('{Home}{ArrowLeft}{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('link', { name: 'A-01 Long asset name' })).toHaveFocus()
  })

  it('reveals ancestors when another link opens a hidden descendant', async () => {
    const user = userEvent.setup()
    renderTree(`${project}/assets/a-01`)
    await user.click(screen.getByRole('button', { name: 'Collapse I-01 Headlamp' }))
    await user.click(screen.getByRole('link', { name: 'Open impact externally' }))

    expect(screen.getByRole('link', { name: 'DS-01 Loss of light' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Collapse I-01 Headlamp' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps shared entities independently expandable under different parents', async () => {
    const user = userEvent.setup()
    const tree: TreeNode[] = [nodes[0], { ...nodes[0], id: 'i-02', code: 'I-02', name: 'Second item' }]
    renderTree(project, tree)
    const occurrences = screen.getAllByRole('button', { name: 'Collapse A-01 Long asset name' })
    await user.click(occurrences[0])

    expect(screen.getAllByRole('link', { name: 'DS-01 Loss of light' })).toHaveLength(1)
    expect(occurrences[1]).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows an empty state without navigation controls', () => {
    renderTree(project, [])
    const navigation = screen.getByRole('navigation', { name: 'Project elements' })
    expect(within(navigation).getByText('No project elements yet.')).toBeInTheDocument()
    expect(within(navigation).queryByRole('button')).not.toBeInTheDocument()
  })

  it('scrolls overflowing labels on hover and resets them on leave', async () => {
    const user = userEvent.setup()
    renderTree()
    const link = screen.getByRole('link', { name: 'A-01 Long asset name' })
    const label = within(link).getByText('Long asset name')
    const cancel = vi.fn<() => void>()
    const animate = vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => Pick<Animation, 'cancel'>>().mockReturnValue({ cancel })
    Object.defineProperty(label, 'scrollWidth', { value: 300 })
    Object.defineProperty(label.parentElement, 'clientWidth', { value: 100 })
    Object.defineProperty(label, 'animate', { value: animate })

    await user.hover(link)
    expect(animate).toHaveBeenCalledOnce()
    expect(animate.mock.calls[0][0].at(-1)).toMatchObject({ transform: 'translateX(-200px)' })
    await user.unhover(link)
    expect(cancel).toHaveBeenCalledOnce()

    fireEvent.focus(link)
    expect(animate).toHaveBeenCalledTimes(2)
    fireEvent.blur(link)
    expect(cancel).toHaveBeenCalledTimes(2)
  })

  it('keeps labels still when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const user = userEvent.setup()
    renderTree()
    const link = screen.getByRole('link', { name: 'A-01 Long asset name' })
    const label = within(link).getByText('Long asset name')
    const animate = vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => Animation>()
    Object.defineProperty(label, 'scrollWidth', { value: 300 })
    Object.defineProperty(label.parentElement, 'clientWidth', { value: 100 })
    Object.defineProperty(label, 'animate', { value: animate })

    await user.hover(link)
    expect(animate).not.toHaveBeenCalled()
    expect(link).toHaveAttribute('title', 'Asset: A-01 Long asset name')
  })
})
