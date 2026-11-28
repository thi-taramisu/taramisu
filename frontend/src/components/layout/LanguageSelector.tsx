import { useTranslation } from 'react-i18next'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { changeLanguage } from '@/i18n'

export function LanguageSelector() {
  const { t, i18n } = useTranslation()

  return (
    <NativeSelect
      className="shrink-0"
      aria-label={t('language')}
      value={i18n.resolvedLanguage ?? 'en'}
      onChange={(event) => changeLanguage(event.target.value)}
    >
      {/* i18n-allow-next-line */}
      <NativeSelectOption value="en" lang="en">English</NativeSelectOption>
      {/* i18n-allow-next-line */}
      <NativeSelectOption value="de" lang="de">Deutsch</NativeSelectOption>
    </NativeSelect>
  )
}
