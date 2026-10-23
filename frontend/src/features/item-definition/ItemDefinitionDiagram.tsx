import { lazy, Suspense } from 'react'

const ItemDefinitionFlow = lazy(() => import('./ItemDefinitionFlow').then((module) => ({ default: module.ItemDefinitionFlow })))

export function ItemDefinitionDiagram() {
  return <Suspense fallback={<output>Loading item diagram…</output>}><ItemDefinitionFlow /></Suspense>
}
