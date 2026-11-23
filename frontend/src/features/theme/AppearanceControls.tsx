import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { colorSchemes } from '../design-system/colorSchemes'
import { setColorScheme, useColorScheme, type ColorSchemeId } from './theme'

export function AppearanceControls() {
  const { t } = useTranslation()
  const id = useId()
  const scheme = useColorScheme()
  return (
    <div className="w-full max-w-xs space-y-2">
      <Label htmlFor={id}>{t('ui:colourScheme')}</Label>
      <NativeSelect id={id} size="sm" value={scheme} onChange={(event) => setColorScheme(event.target.value as ColorSchemeId)}>
        {colorSchemes.map((option) => <NativeSelectOption key={option.id} value={option.id}>{option.name}</NativeSelectOption>)}
      </NativeSelect>
    </div>
  )
}
