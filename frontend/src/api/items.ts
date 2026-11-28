import type { ApiClient } from './client'
import { ApiError } from './errors'
import { isExampleProject } from './mocks/data/headlamp'
import { readAllPages, type PageRequest } from './pagination'
import type { ItemApi, ItemContentService, ItemService } from './services/items'
import { unwrap } from './unwrap'

// REAL: item definitions on `/api/v1/projects/{project_id}/item-definitions`. Everything below the items
// (assets, risks, scenarios) has no frontend adapter yet, so real items have nothing below them. The example
// project is served completely by the mock item API until it lives in the backend.

const collection = '/api/v1/projects/{project_id}/item-definitions'
const member = '/api/v1/projects/{project_id}/item-definitions/{item_id}'

const inProject = (projectId: string) => ({ params: { path: { project_id: projectId } } })
const inItem = (projectId: string, itemId: string) => ({ params: { path: { project_id: projectId, item_id: itemId } } })
const none = async () => []

export function createItemApi(client: ApiClient, example: ItemApi): ItemApi {
  const items: ItemService = {
    list: async (projectId, page) => {
      if (isExampleProject(projectId)) return example.items.list(projectId, page)
      const readPage = async (query: PageRequest) => (await unwrap(client.GET(collection, {
        params: { ...inProject(projectId).params, query },
      }))) ?? []
      return page ? readPage(page) : readAllPages(readPage)
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

  const content: ItemContentService = {
    children: (projectId, itemId) => (isExampleProject(projectId) ? example.content.children(projectId, itemId) : none()),
    assets: (projectId, itemId) => (isExampleProject(projectId) ? example.content.assets(projectId, itemId) : none()),
    addAsset: async (projectId, itemId, asset) => {
      if (isExampleProject(projectId)) return example.content.addAsset(projectId, itemId, asset)
      throw new ApiError(501, 'Assets cannot be added to this project yet.')
    },
    risks: (projectId, itemId) => (isExampleProject(projectId) ? example.content.risks(projectId, itemId) : none()),
    threatScenarios: (projectId, itemId) =>
      isExampleProject(projectId) ? example.content.threatScenarios(projectId, itemId) : none(),
    damageScenarios: (projectId, itemId) =>
      isExampleProject(projectId) ? example.content.damageScenarios(projectId, itemId) : none(),
    attackPaths: (projectId, itemId) => (isExampleProject(projectId) ? example.content.attackPaths(projectId, itemId) : none()),
  }

  // Scenarios and attack paths only exist in the example project, so their mocks serve every request.
  return {
    items,
    content,
    damageScenarios: example.damageScenarios,
    threatScenarios: example.threatScenarios,
    attackPaths: example.attackPaths,
  }
}
