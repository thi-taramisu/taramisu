import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TreeNode } from '../workspace/entities'
import type { ItemDefinitionBody, NewAsset, PatchItemDefinitionBody } from './itemApi'
import { useItemApi } from './ItemApiProvider'

// Everything below a project shares the key prefix, so a change invalidates the tree and the item
// views together.
const keys = {
  project: (projectId: string) => ['projects', projectId] as const,
  tree: (projectId: string) => ['projects', projectId, 'tree'] as const,
  item: (projectId: string, itemId: string) => ['projects', projectId, 'items', itemId] as const,
  assets: (projectId: string, itemId: string) => ['projects', projectId, 'items', itemId, 'assets'] as const,
  risks: (projectId: string, itemId: string) => ['projects', projectId, 'items', itemId, 'risks'] as const,
}

/** Sidebar tree: the items of the project with the elements below them. */
export function useProjectTree(projectId: string, { enabled = true } = {}) {
  const api = useItemApi()
  return useQuery({
    enabled,
    queryKey: keys.tree(projectId),
    queryFn: async (): Promise<TreeNode[]> => {
      const items = await api.items.list(projectId)
      return Promise.all(
        items.map(async (item) => ({
          type: 'items' as const,
          id: item.id,
          name: item.name,
          // One item failing (e.g. deleted meanwhile) must not hide the whole tree.
          children: await api.content.children(projectId, item.id).catch(() => []),
        })),
      )
    },
  })
}

export function useItem(projectId: string, itemId: string) {
  const api = useItemApi()
  return useQuery({ queryKey: keys.item(projectId, itemId), queryFn: () => api.items.get(projectId, itemId) })
}

export function useItemAssets(projectId: string, itemId: string) {
  const api = useItemApi()
  return useQuery({ queryKey: keys.assets(projectId, itemId), queryFn: () => api.content.assets(projectId, itemId) })
}

export function useItemRisks(projectId: string, itemId: string) {
  const api = useItemApi()
  return useQuery({ queryKey: keys.risks(projectId, itemId), queryFn: () => api.content.risks(projectId, itemId) })
}

function useInvalidateProject(projectId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: keys.project(projectId) })
}

export function useCreateItem(projectId: string) {
  const api = useItemApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({ mutationFn: (body: ItemDefinitionBody) => api.items.create(projectId, body), onSuccess: invalidate })
}

export function useUpdateItem(projectId: string, itemId: string) {
  const api = useItemApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (body: PatchItemDefinitionBody) => api.items.update(projectId, itemId, body),
    onSuccess: invalidate,
  })
}

export function useDeleteItem(projectId: string, itemId: string) {
  const api = useItemApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.items.delete(projectId, itemId),
    onSuccess: () => {
      // Only the tree is refreshed: refetching the item's own queries would end in a 404 while
      // its page is still mounted. If the item page is opened again (browser back), its refetch
      // gets the 404 without retries and shows the not-found state.
      queryClient.setQueryData<TreeNode[]>(keys.tree(projectId), (tree) => tree?.filter((node) => node.id !== itemId))
      return queryClient.invalidateQueries({ queryKey: keys.tree(projectId) })
    },
  })
}

export function useAddAsset(projectId: string, itemId: string) {
  const api = useItemApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({ mutationFn: (asset: NewAsset) => api.content.addAsset(projectId, itemId, asset), onSuccess: invalidate })
}
