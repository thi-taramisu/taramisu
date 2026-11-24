import type { ApiClient } from './client'
import { ApiError } from './errors'
import type { components } from './schema'
import type { CiaProperty, ItemAsset } from './models/asset'
import type { DamageScenario, DamageScenarioRelations, ImpactRating } from './models/damageScenario'
import type { DamageScenarioService } from './services/damageScenarios'
import type { ItemService } from './services/items'
import { isExampleProject } from './mocks/data/headlamp'
import { allPages, unwrap } from './unwrap'

type Schemas = components['schemas']
const collection = '/api/v1/item-definitions/{item_definition_id}/damage-scenarios'
const member = '/api/v1/item-definitions/{item_definition_id}/damage-scenarios/{id}'
const ratings = '/api/v1/item-definitions/{item_definition_id}/damage-scenarios/{damage_scenario_id}/impact-ratings'
const ratingMember =
  '/api/v1/item-definitions/{item_definition_id}/damage-scenarios/{damage_scenario_id}/impact-ratings/{id}'
const links = '/api/v1/item-definitions/{item_definition_id}/damage-scenario-asset-properties'
const linkMember = '/api/v1/item-definitions/{item_definition_id}/damage-scenario-asset-properties/{id}'
const threatLinks = '/api/v1/item-definitions/{item_definition_id}/threat-damage-links'
const threatLinkMember = '/api/v1/item-definitions/{item_definition_id}/threat-damage-links/{id}'
const propertyNames = { CONFIDENTIALITY: 'C', INTEGRITY: 'I', AVAILABILITY: 'A' } as const

const inItem = (itemId: string) => ({ params: { path: { item_definition_id: itemId } } })
const pageInItem = (itemId: string, offset: number) => ({
  params: { path: { item_definition_id: itemId }, query: { limit: 100, offset } },
})
const inScenario = (itemId: string, id: string) => ({ params: { path: { item_definition_id: itemId, id } } })
const inRatings = (itemId: string, id: string) => ({
  params: { path: { item_definition_id: itemId, damage_scenario_id: id } },
})

function scenarioView(row: Schemas['DamageScenarioBody']): DamageScenario {
  return {
    ...row,
    code: '',
    functionality_adverse_relation: row.functionality_adverse_relation ?? null,
    road_user_harm_description: row.road_user_harm_description ?? null,
  }
}
function ratingView(row: Schemas['ImpactRatingBody']): ImpactRating {
  return {
    ...row,
    rating_value: row.rating_value ?? null,
    omission_or_rating_rationale: row.omission_or_rating_rationale ?? null,
    is_omitted_by_pm_15_07: row.is_omitted_by_pm_15_07 ?? false,
    reused_from_functional_safety: row.reused_from_functional_safety ?? false,
  }
}

/** Real API scoped through the project's items; the Headlamp example stays in its own mock store. */
export function createDamageScenarioApi(client: ApiClient, items: ItemService, example: DamageScenarioService) {
  async function list(projectId: string, itemId: string) {
    await items.get(projectId, itemId)
    return (await allPages((offset) => unwrap(client.GET(collection, pageInItem(itemId, offset))))).map(scenarioView)
  }
  async function find(projectId: string, id: string) {
    for (const item of await items.list(projectId)) {
      const scenario = (await list(projectId, item.id)).find((row) => row.id === id)
      if (scenario) return scenario
    }
    throw new ApiError(404, 'Damage scenario not found.')
  }
  async function assets(projectId: string, itemId: string) {
    await items.get(projectId, itemId)
    const rows = await allPages((offset) =>
      unwrap(client.GET('/api/v1/item-definitions/{item_definition_id}/assets', pageInItem(itemId, offset))),
    )
    return Promise.all(
      rows.map(async (asset) => {
        const properties = await allPages((offset) =>
          unwrap(
            client.GET('/api/v1/item-definitions/{item_definition_id}/assets/{asset_id}/cybersecurity-properties', {
              params: { path: { item_definition_id: itemId, asset_id: asset.id }, query: { limit: 100, offset } },
            }),
          ),
        )
        return { asset, properties }
      }),
    )
  }
  async function assetViews(projectId: string, itemId: string): Promise<ItemAsset[]> {
    return (await assets(projectId, itemId)).map(({ asset, properties }) => ({
      id: asset.id,
      code: '',
      name: asset.name,
      component: '',
      properties: properties.map((p) => propertyNames[p.property_type]),
      damageScenarios: 0,
      threatScenarios: 0,
      maxRisk: null,
    }))
  }
  async function relations(projectId: string, id: string): Promise<DamageScenarioRelations> {
    const scenario = await find(projectId, id)
    const itemId = scenario.item_definition_id
    const [allAssets, propertyLinks, threats] = await Promise.all([
      assets(projectId, itemId),
      allPages((offset) => unwrap(client.GET(links, pageInItem(itemId, offset)))),
      allPages((offset) => unwrap(client.GET(threatLinks, pageInItem(itemId, offset)))),
    ])
    return {
      assets: allAssets.flatMap(({ asset, properties }) => {
        const linked = properties.filter((p) =>
          propertyLinks?.some(
            (link) => link.damage_scenario_id === id && link.asset_cybersecurity_property_id === p.id,
          ),
        )
        return linked.length
          ? [
              {
                id: asset.id,
                name: asset.name,
                code: '',
                properties: properties.map((p) => propertyNames[p.property_type]),
                linkedProperties: linked.map((p) => propertyNames[p.property_type]),
              },
            ]
          : []
      }),
      // Threat CRUD is connected separately; keep existing links visible using their technical ID.
      threatScenarios: (threats ?? [])
        .filter((link) => link.damage_scenario_id === id)
        .map((link) => ({ id: link.threat_scenario_id, code: '', name: link.threat_scenario_id })),
    }
  }
  async function setAsset(projectId: string, id: string, assetId: string, selected: CiaProperty[]) {
    const { item_definition_id: itemId } = await find(projectId, id)
    const asset = (await assets(projectId, itemId)).find((entry) => entry.asset.id === assetId)
    if (!asset) throw new ApiError(404, 'Asset not found.')
    const desired = asset.properties.filter((p) => selected.includes(propertyNames[p.property_type]))
    if (new Set(selected).size !== selected.length || desired.length !== selected.length)
      throw new ApiError(422, 'Invalid asset properties.')
    const existing = (await allPages((offset) => unwrap(client.GET(links, pageInItem(itemId, offset))))).filter(
      (link) =>
        link.damage_scenario_id === id && asset.properties.some((p) => p.id === link.asset_cybersecurity_property_id),
    )
    // Add first. Retrying after a partial failure re-reads persisted links and does not duplicate them.
    for (const property of desired) {
      if (!existing.some((link) => link.asset_cybersecurity_property_id === property.id)) {
        await unwrap(
          client.POST(links, {
            ...inItem(itemId),
            body: { damage_scenario_id: id, asset_cybersecurity_property_id: property.id },
          }),
        )
      }
    }
    for (const link of existing) {
      if (!desired.some((p) => p.id === link.asset_cybersecurity_property_id))
        await unwrap(client.DELETE(linkMember, inScenario(itemId, link.id)))
    }
    return relations(projectId, id)
  }

  const real: DamageScenarioService = {
    create: async (projectId, body) => {
      await items.get(projectId, body.item_definition_id)
      if (body.asset_properties.length) {
        const available = await assets(projectId, body.item_definition_id)
        for (const link of body.asset_properties) {
          if (
            !available.some(
              ({ asset, properties }) =>
                asset.id === link.asset_id && properties.some((p) => propertyNames[p.property_type] === link.property),
            )
          )
            throw new ApiError(422, 'Invalid asset property.')
        }
      }
      const row = await unwrap(
        client.POST(collection, { ...inItem(body.item_definition_id), body: { title: body.title.trim() } }),
      )
      try {
        for (const assetId of new Set(body.asset_properties.map((link) => link.asset_id))) {
          await setAsset(
            projectId,
            row.id,
            assetId,
            body.asset_properties.filter((link) => link.asset_id === assetId).map((link) => link.property),
          )
        }
      } catch (error) {
        await unwrap(client.DELETE(member, inScenario(body.item_definition_id, row.id)))
        throw error
      }
      return scenarioView(row)
    },
    get: async (projectId, id) => {
      const scenario = await find(projectId, id)
      return scenarioView(await unwrap(client.GET(member, inScenario(scenario.item_definition_id, id))))
    },
    update: async (projectId, id, body) => {
      const scenario = await find(projectId, id)
      return scenarioView(await unwrap(client.PATCH(member, { ...inScenario(scenario.item_definition_id, id), body })))
    },
    delete: async (projectId, id) => {
      const scenario = await find(projectId, id)
      await unwrap(client.DELETE(member, inScenario(scenario.item_definition_id, id)))
    },
    impactRatings: async (projectId, id) => {
      const scenario = await find(projectId, id)
      return ((await unwrap(client.GET(ratings, inRatings(scenario.item_definition_id, id)))) ?? []).map(ratingView)
    },
    updateImpactRatings: async (projectId, id, body) => {
      const scenario = await find(projectId, id)
      const scope = inRatings(scenario.item_definition_id, id)
      const existing = (await unwrap(client.GET(ratings, scope))) ?? []
      if (new Set(body.map((r) => r.impact_category)).size !== body.length)
        throw new ApiError(422, 'Duplicate impact categories.')
      for (const rating of body) {
        const fields: Schemas['ImpactRatingFields'] = {
          ...rating,
          rating_value: rating.rating_value ?? undefined,
          omission_or_rating_rationale: rating.omission_or_rating_rationale ?? undefined,
        }
        const stored = existing.find((r) => r.impact_category === rating.impact_category)
        if (stored)
          await unwrap(
            client.PUT(ratingMember, { params: { path: { ...scope.params.path, id: stored.id } }, body: fields }),
          )
        else await unwrap(client.POST(ratings, { ...scope, body: fields }))
      }
      return ((await unwrap(client.GET(ratings, scope))) ?? []).map(ratingView)
    },
    relations,
    linkAsset: (projectId, id, assetId, properties) => setAsset(projectId, id, assetId, properties),
    unlinkAsset: (projectId, id, assetId) => setAsset(projectId, id, assetId, []),
    linkThreatScenario: async (projectId, id, threatId) => {
      const scenario = await find(projectId, id)
      await unwrap(
        client.POST(threatLinks, {
          ...inItem(scenario.item_definition_id),
          body: { threat_scenario_id: threatId, damage_scenario_id: id },
        }),
      )
      return relations(projectId, id)
    },
    unlinkThreatScenario: async (projectId, id, threatId) => {
      const scenario = await find(projectId, id)
      const existing = (await unwrap(client.GET(threatLinks, inItem(scenario.item_definition_id)))) ?? []
      for (const link of existing.filter(
        (row) => row.damage_scenario_id === id && row.threat_scenario_id === threatId,
      )) {
        await unwrap(client.DELETE(threatLinkMember, inScenario(scenario.item_definition_id, link.id)))
      }
      return relations(projectId, id)
    },
  }
  const target = (projectId: string) => (isExampleProject(projectId) ? example : real)
  const service: DamageScenarioService = {
    create: (p, body) => target(p).create(p, body),
    get: (p, id) => target(p).get(p, id),
    update: (p, id, body) => target(p).update(p, id, body),
    delete: (p, id) => target(p).delete(p, id),
    impactRatings: (p, id) => target(p).impactRatings(p, id),
    updateImpactRatings: (p, id, body) => target(p).updateImpactRatings(p, id, body),
    relations: (p, id) => target(p).relations(p, id),
    linkAsset: (p, id, assetId, properties) => target(p).linkAsset(p, id, assetId, properties),
    unlinkAsset: (p, id, assetId) => target(p).unlinkAsset(p, id, assetId),
    linkThreatScenario: (p, id, threatId) => target(p).linkThreatScenario(p, id, threatId),
    unlinkThreatScenario: (p, id, threatId) => target(p).unlinkThreatScenario(p, id, threatId),
  }
  return { service, list, assets: assetViews }
}
