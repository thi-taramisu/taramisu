import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { colorSchemes } from '../design-system/colorSchemes'
import { ThemeToggle } from './ThemeToggle'
import { setColorScheme, useColorScheme, type ColorSchemeId } from './theme'

export function AppearanceControls() {
  const id = useId()
  const scheme = useColorScheme()
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="sr-only">Color scheme</Label>
      <NativeSelect id={id} size="sm" value={scheme} onChange={(event) => setColorScheme(event.target.value as ColorSchemeId)}>
        {colorSchemes.map((option) => <NativeSelectOption key={option.id} value={option.id}>{option.name}</NativeSelectOption>)}
      </NativeSelect>
      <ThemeToggle />
    </div>
  )
}
