import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors'
import type { Project } from '../models/project'
import { createMockProjectApi } from './mockProjectApi'

const owned: Project = {
  id: 'owned',
  name: 'Owned',
  description: '',
  role: 'OWNER',
  favorite: true,
  archived: false,
  owner: 'Demo User',
  updatedAt: '2026-11-01',
}
const shared: Project = { ...owned, id: 'shared', name: 'Shared', role: 'EDITOR' }

function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => { throw new Error('expected a rejection') },
    (error: unknown) => (error instanceof ApiError ? error.status : error),
  )
}

describe('createMockProjectApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('archives and restores a project and keeps its favorite status', async () => {
    const api = createMockProjectApi([owned])

    expect(await api.archive('owned')).toMatchObject({ archived: true, favorite: true })
    expect(await api.get('owned')).toMatchObject({ archived: true })
    expect(await api.restore('owned')).toMatchObject({ archived: false, favorite: true })
  })

  it('deletes a project', async () => {
    const api = createMockProjectApi([owned, shared])

    await api.delete('owned')

    expect((await api.list()).map((project) => project.id)).toEqual(['shared'])
    expect(await rejection(api.get('owned'))).toBe(404)
  })

  it('only lets owners archive, restore and delete', async () => {
    const api = createMockProjectApi([shared])

    expect(await rejection(api.archive('shared'))).toBe(403)
    expect(await rejection(api.restore('shared'))).toBe(403)
    expect(await rejection(api.delete('shared'))).toBe(403)
    expect(await api.get('shared')).toMatchObject({ archived: false })
  })

  it('rejects unknown projects with 404', async () => {
    const api = createMockProjectApi([])

    expect(await rejection(api.archive('missing'))).toBe(404)
    expect(await rejection(api.delete('missing'))).toBe(404)
  })

  it('creates an owned project and rejects a blank name', async () => {
    const api = createMockProjectApi([])

    expect(await api.create({ name: '  New  ' })).toMatchObject({ name: 'New', role: 'OWNER', archived: false })
    expect(await rejection(api.create({ name: '   ' }))).toBe(422)
  })

  it('releases the image URL of a deleted project', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const api = createMockProjectApi([])

    const project = await api.create({ name: 'With image', image: new File(['x'], 'a.png', { type: 'image/png' }) })
    expect(project.image).toBe('blob:image')

    await api.delete(project.id)
    expect(revoke).toHaveBeenCalledWith('blob:image')
  })

  it('returns copies, so callers cannot change the stored projects', async () => {
    const api = createMockProjectApi([owned])

    const project = await api.get('owned')
    project.archived = true

    expect(await api.get('owned')).toMatchObject({ archived: false })
  })
})
