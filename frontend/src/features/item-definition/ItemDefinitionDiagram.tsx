import { lazy, Suspense } from 'react'
import { ClientOnly } from '../../ClientOnly'

const ItemDefinitionFlow = lazy(() => import('./ItemDefinitionFlow').then((module) => ({ default: module.ItemDefinitionFlow })))

export function ItemDefinitionDiagram() {
  const fallback = <output>Loading item diagram…</output>
  return <ClientOnly fallback={fallback}><Suspense fallback={fallback}><ItemDefinitionFlow /></Suspense></ClientOnly>
}
