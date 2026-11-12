import { useMutation, useQueries, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useApi } from '../ApiProvider'
import type { CiaProperty, NewAsset, PatchAssetBody } from '../models/asset'
import type { AttackFeasibilityRatingBody, PatchAttackPathBody } from '../models/attackPath'
import type { DamageScenarioBody, ImpactRatingBody, PatchDamageScenarioBody } from '../models/damageScenario'
import type { ItemDefinitionBody, PatchItemDefinitionBody } from '../models/item'
import type { PatchThreatScenarioBody, ThreatTarget } from '../models/threatScenario'
import type { TreeNode } from '../models/tree'

// Everything below a project shares the key prefix, so a change invalidates the tree and the item
// views together.
const keys = {
  project: (projectId: string) => ['projects', projectId] as const,
  tree: (projectId: string) => ['projects', projectId, 'tree'] as const,
  item: (projectId: string, itemId: string) => ['projects', projectId, 'items', itemId] as const,
  children: (projectId: string, itemId: string) => ['projects', projectId, 'items', itemId, 'children'] as const,
  assets: (projectId: string, itemId: string) => ['projects', projectId, 'items', itemId, 'assets'] as const,
  risks: (projectId: string, itemId: string) => ['projects', projectId, 'items', itemId, 'risks'] as const,
  threatScenarios: (projectId: string, itemId: string) => ['projects', projectId, 'items', itemId, 'threat-scenarios'] as const,
  asset: (projectId: string, id: string) => ['projects', projectId, 'assets', id] as const,
  assetRelations: (projectId: string, id: string) => ['projects', projectId, 'assets', id, 'relations'] as const,
  damageScenario: (projectId: string, id: string) => ['projects', projectId, 'damage-scenarios', id] as const,
  impactRatings: (projectId: string, id: string) => ['projects', projectId, 'damage-scenarios', id, 'impact'] as const,
  damageScenarioRelations: (projectId: string, id: string) => ['projects', projectId, 'damage-scenarios', id, 'relations'] as const,
  itemDamageScenarios: (projectId: string, itemId: string) => ['projects', projectId, 'items', itemId, 'damage-scenarios'] as const,
  itemAttackPaths: (projectId: string, itemId: string) => ['projects', projectId, 'items', itemId, 'attack-paths'] as const,
  threatScenario: (projectId: string, id: string) => ['projects', projectId, 'threat-scenarios', id] as const,
  threatScenarioRelations: (projectId: string, id: string) => ['projects', projectId, 'threat-scenarios', id, 'relations'] as const,
  threatScenarioRiskInputs: (projectId: string, id: string) => ['projects', projectId, 'threat-scenarios', id, 'risk-inputs'] as const,
  attackPath: (projectId: string, id: string) => ['projects', projectId, 'attack-paths', id] as const,
  attackPathRating: (projectId: string, id: string) => ['projects', projectId, 'attack-paths', id, 'rating'] as const,
  attackPathRelations: (projectId: string, id: string) => ['projects', projectId, 'attack-paths', id, 'relations'] as const,
}

/** Sidebar tree: the items of the project with the elements below them. */
export function useProjectTree(projectId: string, { enabled = true } = {}) {
  const api = useApi()
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

/** The elements below one item. Unlike the tree, a failed request is an error and not an empty list. */
export function useItemChildren(projectId: string, itemId: string, { enabled = true } = {}) {
  const api = useApi()
  return useQuery({
    enabled,
    queryKey: keys.children(projectId, itemId),
    queryFn: () => api.content.children(projectId, itemId),
  })
}

export function useItem(projectId: string, itemId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.item(projectId, itemId), queryFn: () => api.items.get(projectId, itemId) })
}

export function useItemAssets(projectId: string, itemId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.assets(projectId, itemId), queryFn: () => api.content.assets(projectId, itemId) })
}

export function useItemRisks(projectId: string, itemId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.risks(projectId, itemId), queryFn: () => api.content.risks(projectId, itemId) })
}

export function useItemThreatScenarios(projectId: string, itemId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.threatScenarios(projectId, itemId), queryFn: () => api.content.threatScenarios(projectId, itemId) })
}

function useInvalidateProject(projectId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: keys.project(projectId) })
}

export function useCreateItem(projectId: string) {
  const api = useApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({ mutationFn: (body: ItemDefinitionBody) => api.items.create(projectId, body), onSuccess: invalidate })
}

export function useUpdateItem(projectId: string, itemId: string) {
  const api = useApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (body: PatchItemDefinitionBody) => api.items.update(projectId, itemId, body),
    onSuccess: invalidate,
  })
}

export function useDeleteItem(projectId: string, itemId: string) {
  const api = useApi()
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

/** Creates an asset in the given item; the item is part of the call, so one dialog can create in any item. */
export function useCreateAsset(projectId: string) {
  const api = useApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: ({ itemId, asset }: { itemId: string; asset: NewAsset }) => api.content.addAsset(projectId, itemId, asset),
    onSuccess: invalidate,
  })
}

export function useAsset(projectId: string, assetId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.asset(projectId, assetId), queryFn: () => api.assets.get(projectId, assetId) })
}

export function useUpdateAsset(projectId: string, assetId: string) {
  const api = useApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({ mutationFn: (body: PatchAssetBody) => api.assets.update(projectId, assetId, body), onSuccess: invalidate })
}

export function useAssetRelations(projectId: string, assetId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.assetRelations(projectId, assetId), queryFn: () => api.assets.relations(projectId, assetId) })
}

/** Links a damage scenario with the given properties of the asset or changes them; no properties remove the link. */
export function useSetAssetDamageLink(projectId: string, assetId: string) {
  const api = useApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: ({ damageScenarioId, properties }: { damageScenarioId: string; properties: CiaProperty[] }) =>
      properties.length > 0
        ? api.damageScenarios.linkAsset(projectId, damageScenarioId, assetId, properties)
        : api.damageScenarios.unlinkAsset(projectId, damageScenarioId, assetId),
    onSuccess: invalidate,
  })
}

export function useDamageScenario(projectId: string, damageScenarioId: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.damageScenario(projectId, damageScenarioId),
    queryFn: () => api.damageScenarios.get(projectId, damageScenarioId),
  })
}

export function useImpactRatings(projectId: string, damageScenarioId: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.impactRatings(projectId, damageScenarioId),
    queryFn: () => api.damageScenarios.impactRatings(projectId, damageScenarioId),
  })
}

export function useDamageScenarioRelations(projectId: string, damageScenarioId: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.damageScenarioRelations(projectId, damageScenarioId),
    queryFn: () => api.damageScenarios.relations(projectId, damageScenarioId),
  })
}

export function useCreateDamageScenario(projectId: string) {
  const api = useApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({ mutationFn: (body: DamageScenarioBody) => api.damageScenarios.create(projectId, body), onSuccess: invalidate })
}

export function useUpdateDamageScenario(projectId: string, damageScenarioId: string) {
  const api = useApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (body: PatchDamageScenarioBody) => api.damageScenarios.update(projectId, damageScenarioId, body),
    onSuccess: invalidate,
  })
}

export function useUpdateImpactRatings(projectId: string, damageScenarioId: string) {
  const api = useApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (body: ImpactRatingBody[]) => api.damageScenarios.updateImpactRatings(projectId, damageScenarioId, body),
    onSuccess: invalidate,
  })
}

/** Keeps the saved relations even if the refetch fails, so the next change does not start from the old ones. */
function useStoreRelations(projectId: string, key: QueryKey) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateProject(projectId)
  return (relations: unknown) => {
    queryClient.setQueryData(key, relations)
    return invalidate()
  }
}

/** Links an asset with the given properties or changes them; no properties remove the link. */
export function useSetDamageScenarioAssetLink(projectId: string, damageScenarioId: string) {
  const api = useApi()
  const storeRelations = useStoreRelations(projectId, keys.damageScenarioRelations(projectId, damageScenarioId))
  return useMutation({
    mutationFn: ({ assetId, properties }: { assetId: string; properties: CiaProperty[] }) =>
      properties.length > 0
        ? api.damageScenarios.linkAsset(projectId, damageScenarioId, assetId, properties)
        : api.damageScenarios.unlinkAsset(projectId, damageScenarioId, assetId),
    onSuccess: storeRelations,
  })
}

/** Links or unlinks an element; the service returns the relations, which replace the stored ones. */
function useLinkMutation<Relations>(
  projectId: string,
  key: QueryKey,
  link: (id: string) => Promise<Relations>,
  unlink: (id: string) => Promise<Relations>,
) {
  const storeRelations = useStoreRelations(projectId, key)
  return useMutation({
    mutationFn: ({ id, linked }: { id: string; linked: boolean }) => (linked ? link(id) : unlink(id)),
    onSuccess: storeRelations,
  })
}

export function useSetDamageScenarioThreatLink(projectId: string, damageScenarioId: string) {
  const api = useApi()
  return useLinkMutation(
    projectId,
    keys.damageScenarioRelations(projectId, damageScenarioId),
    (id) => api.damageScenarios.linkThreatScenario(projectId, damageScenarioId, id),
    (id) => api.damageScenarios.unlinkThreatScenario(projectId, damageScenarioId, id),
  )
}

export function useItemDamageScenarios(projectId: string, itemId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.itemDamageScenarios(projectId, itemId), queryFn: () => api.content.damageScenarios(projectId, itemId) })
}

export function useItemAttackPaths(projectId: string, itemId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.itemAttackPaths(projectId, itemId), queryFn: () => api.content.attackPaths(projectId, itemId) })
}

export function useThreatScenario(projectId: string, threatScenarioId: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.threatScenario(projectId, threatScenarioId),
    queryFn: () => api.threatScenarios.get(projectId, threatScenarioId),
  })
}

/** Saves the Definition tab: its fields and the targets, together with one button. */
export function useSaveThreatDefinition(projectId: string, threatScenarioId: string) {
  const api = useApi()
  const storeRelations = useStoreRelations(projectId, keys.threatScenarioRelations(projectId, threatScenarioId))
  return useMutation({
    mutationFn: async ({ body, targets }: { body: PatchThreatScenarioBody; targets: ThreatTarget[] }) => ({
      scenario: await api.threatScenarios.update(projectId, threatScenarioId, body),
      relations: await api.threatScenarios.setTargets(projectId, threatScenarioId, targets),
    }),
    onSuccess: ({ relations }) => storeRelations(relations),
  })
}

export function useThreatScenarioRiskInputs(projectId: string, threatScenarioId: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.threatScenarioRiskInputs(projectId, threatScenarioId),
    queryFn: () => api.threatScenarios.riskInputs(projectId, threatScenarioId),
  })
}

/** Risk inputs of several threat scenarios, e.g. all that reach an asset; shares the cache with the threat scenario's Risks tab. */
export function useThreatScenariosRiskInputs(projectId: string, threatScenarioIds: string[]) {
  const api = useApi()
  return useQueries({
    queries: threatScenarioIds.map((id) => ({
      queryKey: keys.threatScenarioRiskInputs(projectId, id),
      queryFn: () => api.threatScenarios.riskInputs(projectId, id),
    })),
  })
}

export function useThreatScenarioRelations(projectId: string, threatScenarioId: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.threatScenarioRelations(projectId, threatScenarioId),
    queryFn: () => api.threatScenarios.relations(projectId, threatScenarioId),
  })
}

export function useSetThreatDamageLink(projectId: string, threatScenarioId: string) {
  const api = useApi()
  return useLinkMutation(
    projectId,
    keys.threatScenarioRelations(projectId, threatScenarioId),
    (id) => api.threatScenarios.linkDamageScenario(projectId, threatScenarioId, id),
    (id) => api.threatScenarios.unlinkDamageScenario(projectId, threatScenarioId, id),
  )
}

export function useSetThreatAttackPathLink(projectId: string, threatScenarioId: string) {
  const api = useApi()
  return useLinkMutation(
    projectId,
    keys.threatScenarioRelations(projectId, threatScenarioId),
    (id) => api.threatScenarios.linkAttackPath(projectId, threatScenarioId, id),
    (id) => api.threatScenarios.unlinkAttackPath(projectId, threatScenarioId, id),
  )
}

export function useAttackPath(projectId: string, attackPathId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.attackPath(projectId, attackPathId), queryFn: () => api.attackPaths.get(projectId, attackPathId) })
}

export function useUpdateAttackPath(projectId: string, attackPathId: string) {
  const api = useApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({ mutationFn: (body: PatchAttackPathBody) => api.attackPaths.update(projectId, attackPathId, body), onSuccess: invalidate })
}

export function useAttackPathRating(projectId: string, attackPathId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.attackPathRating(projectId, attackPathId), queryFn: () => api.attackPaths.rating(projectId, attackPathId) })
}

export function useUpdateAttackPathRating(projectId: string, attackPathId: string) {
  const api = useApi()
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (body: AttackFeasibilityRatingBody) => api.attackPaths.updateRating(projectId, attackPathId, body),
    onSuccess: invalidate,
  })
}

export function useAttackPathRelations(projectId: string, attackPathId: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.attackPathRelations(projectId, attackPathId), queryFn: () => api.attackPaths.relations(projectId, attackPathId) })
}

export function useSetAttackPathThreatLink(projectId: string, attackPathId: string) {
  const api = useApi()
  return useLinkMutation(
    projectId,
    keys.attackPathRelations(projectId, attackPathId),
    (id) => api.attackPaths.linkThreatScenario(projectId, attackPathId, id),
    (id) => api.attackPaths.unlinkThreatScenario(projectId, attackPathId, id),
  )
}
