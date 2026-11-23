import { useQuery } from '@tanstack/react-query'
import { useApi } from '../../api/ApiProvider'
import { buildRelationGraph } from './graphModel'

/** Strict loading for the graph: a failed relation request must not look like an empty graph. */
export function useRelationGraph(projectId: string) {
  const api = useApi()
  return useQuery({
    queryKey: ['projects', projectId, 'relation-graph'],
    queryFn: async () => {
      const items = await api.items.list(projectId)
      const data = await Promise.all(items.map(async (item) => {
        const [children, risks] = await Promise.all([api.content.children(projectId, item.id), api.content.risks(projectId, item.id)])
        return { tree: { type: 'items' as const, id: item.id, name: item.name, children }, risks }
      }))
      return buildRelationGraph(data)
    },
  })
}
