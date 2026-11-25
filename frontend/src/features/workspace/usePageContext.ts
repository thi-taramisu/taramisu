import { matchPath, useLocation } from 'react-router-dom'
import type { EntityType, TreeNode } from '../../api/models/tree'
import { findNode } from './entities'

/**
 * Element of the page a "+ New" dialog is opened on and the item it belongs to, so the dialog can start
 * from them. Falls back to the first item outside an element page.
 */
export function usePageContext(items: TreeNode[]): { itemId: string; type?: EntityType; entityId: string } {
  const { pathname } = useLocation()
  const match = matchPath('/projects/:projectId/:type/:entityId/*', pathname)
  const type = match?.params.type as EntityType | undefined
  const entityId = match?.params.entityId ?? ''
  const item = (type && items.find((node) => findNode(type, entityId, [node]))) || items[0]
  return { itemId: item?.id ?? '', type, entityId }
}
