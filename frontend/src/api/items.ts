import type { ApiClient } from './client'
import { ApiError } from './errors'
import { isExampleProject } from './mocks/data/headlamp'
import type { ItemApi, ItemContentService, ItemService } from './services/items'
import { createDamageScenarioApi } from './damageScenarios'
import { allPages, unwrap } from './unwrap'

// REAL: item definitions and damage scenarios use their backend routes. The Headlamp example
// is served entirely by the mock API. Other entity adapters are added in their own tickets.

const collection = '/api/v1/projects/{project_id}/item-definitions'
const member = '/api/v1/projects/{project_id}/item-definitions/{item_id}'

const inProject = (projectId: string) => ({ params: { path: { project_id: projectId } } })
const inItem = (projectId: string, itemId: string) => ({ params: { path: { project_id: projectId, item_id: itemId } } })
const none = async () => []

export function createItemApi(client: ApiClient, example: ItemApi): ItemApi {
  const items: ItemService = {
    list: async (projectId) => {
      if (isExampleProject(projectId)) return example.items.list(projectId)
      return allPages((offset) => unwrap(client.GET(collection, { params: { path: { project_id: projectId }, query: { limit: 100, offset } } })))
    },
    get: (projectId, itemId) => {
      if (isExampleProject(projectId)) return example.items.get(projectId, itemId)
      return unwrap(client.GET(member, inItem(projectId, itemId)))
    },
    create: (projectId, body) => {
      if (isExampleProject(projectId)) return example.items.create(projectId, body)
      return unwrap(client.POST(collection, { ...inProject(projectId), body: { ...body, name: body.name.trim() } }))
    },
    update: (projectId, itemId, body) => {
      if (isExampleProject(projectId)) return example.items.update(projectId, itemId, body)
      const name = body.name?.trim()
      return unwrap(client.PATCH(member, { ...inItem(projectId, itemId), body: name === undefined ? body : { ...body, name } }))
    },
    delete: async (projectId, itemId) => {
      if (isExampleProject(projectId)) return example.items.delete(projectId, itemId)
      await unwrap(client.DELETE(member, inItem(projectId, itemId)))
    },
  }

  const damage = createDamageScenarioApi(client, items, example.damageScenarios)

  const content: ItemContentService = {
    children: (projectId, itemId) => (isExampleProject(projectId) ? example.content.children(projectId, itemId) : damage.list(projectId, itemId).then((rows) => rows.map((row) => ({ type: 'damage-scenarios' as const, id: row.id, name: row.title })))),
    assets: (projectId, itemId) => (isExampleProject(projectId) ? example.content.assets(projectId, itemId) : damage.assets(projectId, itemId)),
    addAsset: async (projectId, itemId, asset) => {
      if (isExampleProject(projectId)) return example.content.addAsset(projectId, itemId, asset)
      throw new ApiError(501, 'Assets cannot be added to this project yet.')
    },
    risks: (projectId, itemId) => (isExampleProject(projectId) ? example.content.risks(projectId, itemId) : none()),
    threatScenarios: (projectId, itemId) =>
      isExampleProject(projectId) ? example.content.threatScenarios(projectId, itemId) : none(),
    damageScenarios: (projectId, itemId) =>
      isExampleProject(projectId) ? example.content.damageScenarios(projectId, itemId) : damage.list(projectId, itemId).then((rows) => rows.map((row) => ({ id: row.id, name: row.title, code: row.code }))),
    attackPaths: (projectId, itemId) => (isExampleProject(projectId) ? example.content.attackPaths(projectId, itemId) : none()),
  }

  // Threat scenarios and attack paths remain mocked until their own API integration.
  return {
    items,
    content,
    damageScenarios: damage.service,
    threatScenarios: example.threatScenarios,
    attackPaths: example.attackPaths,
  }
}
