import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../ApiProvider'
import type { NewProject, Project, ProjectUpdate } from '../models/project'

// The list has its own key: everything below a project uses the prefix ['projects', projectId] (see
// `items.ts`), and refreshing the list must not refetch every project's tree.
const keys = {
  list: ['project-list'] as const,
  project: (projectId: string) => ['projects', projectId, 'details'] as const,
}

export function useProjects() {
  const api = useApi()
  return useQuery({ queryKey: keys.list, queryFn: () => api.projects.list() })
}

export function useProject(projectId: string) {
  const api = useApi()
  // 404s are not retried, see the query client in `main.tsx`.
  return useQuery({ queryKey: keys.project(projectId), queryFn: () => api.projects.get(projectId) })
}

/**
 * What the current user may do in a project. Archived projects are read-only for all members until they
 * are restored; nothing can be edited before the project is loaded. The backend enforces the same (#233),
 * so this only shapes the UI.
 */
export function useProjectAccess(projectId: string) {
  const { data: project } = useProject(projectId)
  return {
    archived: project?.archived ?? false,
    canEdit: project !== undefined && !project.archived,
  }
}

/** Writes a changed or new project into its query and the list, without refetching the list. */
function useStoreProject() {
  const queryClient = useQueryClient()
  return (project: Project) => {
    queryClient.setQueryData(keys.project(project.id), project)
    queryClient.setQueryData<Project[]>(keys.list, (projects) => {
      if (!projects) return projects
      return projects.some((p) => p.id === project.id)
        ? projects.map((p) => (p.id === project.id ? project : p))
        : [...projects, project]
    })
  }
}

/** Clears the errors of failed mutations, so an old failure is not shown after a new action. */
export function resetFailed(...mutations: { isError: boolean; reset: () => void }[]) {
  for (const mutation of mutations) {
    if (mutation.isError) mutation.reset()
  }
}

export function useCreateProject() {
  const api = useApi()
  const store = useStoreProject()
  return useMutation({ mutationFn: (body: NewProject) => api.projects.create(body), onSuccess: store })
}

/** Renames a project, i.e. changes its name and description. */
export function useUpdateProject() {
  const api = useApi()
  const store = useStoreProject()
  return useMutation({
    mutationFn: ({ projectId, ...body }: ProjectUpdate & { projectId: string }) => api.projects.update(projectId, body),
    onSuccess: store,
  })
}

/** Shows the new favorite state at once, so quick clicks toggle back and forth; undone on failure. */
export function useSetFavorite() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, favorite }: { projectId: string; favorite: boolean }) =>
      api.projects.setFavorite(projectId, favorite),
    onMutate: async ({ projectId, favorite }) => {
      await queryClient.cancelQueries({ queryKey: keys.list })
      const previous = queryClient.getQueryData<Project[]>(keys.list)
      queryClient.setQueryData<Project[]>(keys.list, (projects) =>
        projects?.map((p) => (p.id === projectId ? { ...p, favorite } : p)))
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(keys.list, context?.previous)
    },
    // The list already shows the new state; writing the response into it could undo a later click.
    onSuccess: (project) => queryClient.setQueryData(keys.project(project.id), project),
  })
}

export function useArchiveProject() {
  const api = useApi()
  const store = useStoreProject()
  return useMutation({ mutationFn: (projectId: string) => api.projects.archive(projectId), onSuccess: store })
}

export function useRestoreProject() {
  const api = useApi()
  const store = useStoreProject()
  return useMutation({ mutationFn: (projectId: string) => api.projects.restore(projectId), onSuccess: store })
}

export function useDeleteProject() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) => api.projects.delete(projectId),
    onSuccess: (_, projectId) => {
      queryClient.setQueryData<Project[]>(keys.list, (projects) => projects?.filter((p) => p.id !== projectId))
      queryClient.removeQueries({ queryKey: keys.project(projectId) })
      return queryClient.invalidateQueries({ queryKey: keys.list })
    },
  })
}
