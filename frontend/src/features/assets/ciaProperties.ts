import type { CiaProperty } from '../../api/models/asset'

export const CIA_PROPERTIES: { value: CiaProperty; label: string }[] = [
  { value: 'C', label: 'ui:confidentiality' },
  { value: 'I', label: 'ui:integrity' },
  { value: 'A', label: 'ui:availability' },
]
