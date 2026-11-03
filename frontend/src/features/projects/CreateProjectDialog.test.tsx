import { useState, type MouseEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateProjectDialog } from './CreateProjectDialog'

function TestPage({
  onCreateProject = vi.fn<(name: string, image?: File) => void>(),
}: {
  onCreateProject?: (name: string, image?: File) => void
}) {
  const [open, setOpen] = useState(false)
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null)

  function handleOpen(event: MouseEvent<HTMLButtonElement>) {
    setOpener(event.currentTarget)
    setOpen(true)
  }

  return (
    <>
      <button type="button" onClick={handleOpen}>
        Open create project
      </button>

      <CreateProjectDialog
        open={open}
        onOpenChange={setOpen}
        onCreateProject={onCreateProject}
        returnFocusTo={opener}
      />
    </>
  )
}

function openDialog() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Open create project' }),
  )
}

describe('CreateProjectDialog', () => {
  it('submits the selected image, independently of the dialog preview URL', async () => {
    const user = userEvent.setup()
    const onCreateProject = vi.fn<(name: string, image?: File) => void>()
    render(<TestPage onCreateProject={onCreateProject} />)
    openDialog()
    const file = new File(['image'], 'project.png', { type: 'image/png' })
    await user.type(screen.getByLabelText('Project name'), 'Image project')
    await user.upload(screen.getByLabelText('Image'), file)
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreateProject).toHaveBeenCalledExactlyOnceWith('Image project', file)
  })

  it('clears rejected images before creating a project', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const onCreateProject = vi.fn<(name: string, image?: File) => void>()
    render(<TestPage onCreateProject={onCreateProject} />)
    openDialog()
    await user.type(screen.getByLabelText('Project name'), 'Without image')
    await user.upload(screen.getByLabelText('Image'), new File(['notes'], 'notes.txt', { type: 'text/plain' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreateProject).toHaveBeenCalledExactlyOnceWith('Without image')
  })

  it('submits the project form with a valid name', () => {
    const onCreateProject = vi.fn<(name: string, image?: File) => void>()

    render(<TestPage onCreateProject={onCreateProject} />)
    openDialog()

    const input = screen.getByRole('textbox', {
      name: 'Project name',
    })

    fireEvent.change(input, {
      target: { value: '  Battery Analysis  ' },
    })

    const form = input.closest('form')
    expect(form).not.toBeNull()

    fireEvent.submit(form!)

    expect(onCreateProject).toHaveBeenCalledExactlyOnceWith(
      'Battery Analysis',
    )
  })

  it('rejects whitespace-only project names', () => {
    const onCreateProject = vi.fn<(name: string, image?: File) => void>()

    render(<TestPage onCreateProject={onCreateProject} />)
    openDialog()

    const input = screen.getByRole('textbox', {
      name: 'Project name',
    })

    fireEvent.change(input, {
      target: { value: '   ' },
    })

    fireEvent.submit(input.closest('form')!)

    expect(onCreateProject).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('returns focus to the opener after Cancel', async () => {
    render(<TestPage />)
    openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Open create project' }),
      ).toHaveFocus()
    })
  })

  it('returns focus to the opener after Escape', async () => {
    render(<TestPage />)
    openDialog()

    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      code: 'Escape',
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Open create project' }),
      ).toHaveFocus()
    })
  })
})
