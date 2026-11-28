import type { ApiClient } from './client'
import { ApiError } from './errors'
import { isExampleProject } from './mocks/data/headlamp'
import type { ThreatScenario } from './models/threatScenario'
import { readAllPages, type PageRequest } from './pagination'
import type { components } from './schema'
import type { ItemApi, ItemContentService, ItemService } from './services/items'
import { unwrap } from './unwrap'

// Real item definitions and threat scenarios use the typed API. The example project uses the mock API.

const collection = '/api/v1/projects/{project_id}/item-definitions'
const member = '/api/v1/projects/{project_id}/item-definitions/{item_id}'
const threatCollection = '/api/v1/item-definitions/{item_definition_id}/threat-scenarios'
const threatMember = '/api/v1/item-definitions/{item_definition_id}/threat-scenarios/{id}'

const inProject = (projectId: string) => ({ params: { path: { project_id: projectId } } })
const inItem = (projectId: string, itemId: string) => ({ params: { path: { project_id: projectId, item_id: itemId } } })
const none = async () => []

const inThreat = (itemId: string, id: string) => ({ params: { path: { item_definition_id: itemId, id } } })

function toThreatScenario({ display_id, cause_of_compromise, elicitation_method, technical_notes, ...scenario }:
  components['schemas']['ThreatScenarioBody']): ThreatScenario {
  return {
    ...scenario,
    code: display_id,
    cause_of_compromise: cause_of_compromise ?? null,
    elicitation_method: elicitation_method ?? null,
    technical_notes: technical_notes ?? null,
  }
}

export async function deleteThreatScenario(client: ApiClient, itemId: string, scenarioId: string) {
  await unwrap(client.DELETE(threatMember, inThreat(itemId, scenarioId)))
}

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

  async function threatReferences(itemId: string) {
    const scenarios = await readAllPages(async (query) =>
      (await unwrap(client.GET(threatCollection, { params: { path: { item_definition_id: itemId }, query } }))) ?? [],
    )
    return scenarios.map(({ id, display_id, title }) => ({ id, code: display_id, name: title }))
  }

  const content: ItemContentService = {
    children: async (projectId, itemId) => {
      if (isExampleProject(projectId)) return example.content.children(projectId, itemId)
      return (await threatReferences(itemId)).map((ref) => ({ ...ref, type: 'threat-scenarios' }))
    },
    assets: (projectId, itemId) => (isExampleProject(projectId) ? example.content.assets(projectId, itemId) : none()),
    addAsset: async (projectId, itemId, asset) => {
      if (isExampleProject(projectId)) return example.content.addAsset(projectId, itemId, asset)
      throw new ApiError(501, 'Assets cannot be added to this project yet.')
    },
    risks: (projectId, itemId) => (isExampleProject(projectId) ? example.content.risks(projectId, itemId) : none()),
    threatScenarios: (projectId, itemId) =>
      isExampleProject(projectId) ? example.content.threatScenarios(projectId, itemId) : threatReferences(itemId),
    damageScenarios: (projectId, itemId) =>
      isExampleProject(projectId) ? example.content.damageScenarios(projectId, itemId) : none(),
    attackPaths: (projectId, itemId) => (isExampleProject(projectId) ? example.content.attackPaths(projectId, itemId) : none()),
  }

  return {
    items,
    content,
    assets: example.assets,
    damageScenarios: example.damageScenarios,
    threatScenarios: {
      ...example.threatScenarios,
      create: async (projectId, body) => {
        if (isExampleProject(projectId)) return example.threatScenarios.create(projectId, body)
        const { item_definition_id, title } = body
        return toThreatScenario(await unwrap(client.POST(threatCollection, {
          params: { path: { item_definition_id } },
          body: { title: title.trim() },
        })))
      },
      get: async (projectId, id, itemId) => {
        if (isExampleProject(projectId)) return example.threatScenarios.get(projectId, id)
        if (!itemId) throw new ApiError(404, 'Threat scenario not found.')
        return toThreatScenario(await unwrap(client.GET(threatMember, inThreat(itemId, id))))
      },
      update: async (projectId, id, body, itemId) => {
        if (isExampleProject(projectId)) return example.threatScenarios.update(projectId, id, body)
        if (!itemId) throw new ApiError(404, 'Threat scenario not found.')
        return toThreatScenario(await unwrap(client.PATCH(threatMember, { ...inThreat(itemId, id), body })))
      },
    },
    attackPaths: example.attackPaths,
  }
}
