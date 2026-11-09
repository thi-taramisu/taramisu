import type { CiaProperty } from '../../api/models/asset'

export const CIA_PROPERTIES: { value: CiaProperty; label: string }[] = [
  { value: 'C', label: 'Confidentiality' },
  { value: 'I', label: 'Integrity' },
  { value: 'A', label: 'Availability' },
]
