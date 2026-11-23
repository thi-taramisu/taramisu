import type { Page } from '@playwright/test'

type ItemBody = { name: string; scope_type: 'ITEM' | 'COMPONENT' } & Record<string, string | null | undefined>

interface ItemDefinition extends ItemBody {
  id: string
  tara_project_id: string
  created_at: string
}

/** Leaves out empty fields, as the backend does. */
function withoutNulls(item: ItemDefinition) {
  return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null && value !== undefined))
}

/**
 * Serves `/api/v1/projects/{project_id}/item-definitions` from memory, since `vite preview` runs without the
 * backend. Follows `backend/openapi.json`: list, create, get, update (PATCH, null clears a field) and delete.
 */
export async function stubItemsApi(page: Page) {
  const items = new Map<string, ItemDefinition>()
  const notFound = { status: 404, json: { status: 404, title: 'Not Found', detail: 'item definition not found' } }

  await page.route(/\/api\/v1\/projects\/[^/]+\/item-definitions(\/[^/?]+)?(\?.*)?$/, async (route) => {
    const request = route.request()
    const [, , , , projectId, , itemId] = new URL(request.url()).pathname.split('/')
    if (!itemId) {
      if (request.method() === 'GET') {
        return route.fulfill({ json: [...items.values()].filter((item) => item.tara_project_id === projectId).map(withoutNulls) })
      }
      const item: ItemDefinition = {
        ...(request.postDataJSON() as ItemBody),
        id: crypto.randomUUID(),
        tara_project_id: projectId,
        created_at: new Date().toISOString(),
      }
      items.set(item.id, item)
      return route.fulfill({ status: 201, json: withoutNulls(item) })
    }
    const item = items.get(itemId)
    if (!item || item.tara_project_id !== projectId) return route.fulfill(notFound)
    if (request.method() === 'PATCH') Object.assign(item, request.postDataJSON())
    if (request.method() === 'DELETE') {
      items.delete(itemId)
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ json: withoutNulls(item) })
  })
}
