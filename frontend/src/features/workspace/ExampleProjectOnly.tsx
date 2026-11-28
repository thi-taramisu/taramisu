import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { isExampleProject } from '../../api/mocks/data/headlamp'
import { Placeholder } from './Placeholder'

/**
 * Tab content that only the mocked example project has so far; real projects show the placeholder of the tab
 * until its routes are connected (#250).
 */
export function ExampleProjectOnly({ tab, children }: { tab: string; children: ReactNode }) {
  const { t } = useTranslation()
  const { projectId = '' } = useParams()
  return isExampleProject(projectId) ? children : <Placeholder title={t(`navigation.tabs.${tab}`)} />
}
