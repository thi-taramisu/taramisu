import { useTranslation } from 'react-i18next'
import { lazy, Suspense } from 'react'

const ItemDefinitionFlow = lazy(() => import('./ItemDefinitionFlow').then((module) => ({ default: module.ItemDefinitionFlow })))

export function ItemDefinitionDiagram() {
  const { t } = useTranslation()
  return <Suspense fallback={<output>{t('ui:loadingDiagram')}</output>}><ItemDefinitionFlow /></Suspense>
}
