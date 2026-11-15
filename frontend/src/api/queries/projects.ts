import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../ApiProvider'
import { retryUnlessNotFound } from '../errors'
import type { NewProject, Project } from '../models/project'

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
  return useQuery({
    queryKey: keys.project(projectId),
    queryFn: () => api.projects.get(projectId),
    retry: retryUnlessNotFound,
  })
}

/** Stores the changed project in its query and refreshes the list. */
function useStoreProject() {
  const queryClient = useQueryClient()
  return (project: Project) => {
    queryClient.setQueryData(keys.project(project.id), project)
    return queryClient.invalidateQueries({ queryKey: keys.list })
  }
}

export function useCreateProject() {
  const api = useApi()
  const store = useStoreProject()
  return useMutation({ mutationFn: (body: NewProject) => api.projects.create(body), onSuccess: store })
}

export function useSetFavorite() {
  const api = useApi()
  const store = useStoreProject()
  return useMutation({
    mutationFn: ({ projectId, favorite }: { projectId: string; favorite: boolean }) =>
      api.projects.setFavorite(projectId, favorite),
    onSuccess: store,
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
