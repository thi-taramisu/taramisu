import { useTranslation } from 'react-i18next'
import { useId, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ApiError } from '../../api/errors'
import type { Asset, AssetRelations, CiaProperty, IdentificationSource } from '../../api/models/asset'
import { useAsset, useAssetRelations, useUpdateAsset } from '../../api/queries/items'
import { entityPath } from '../workspace/entities'
import { AssetPropertiesField, type PropertyValues } from './AssetPropertiesField'
import { CIA_PROPERTIES } from './ciaProperties'

const IDENTIFICATION_SOURCES: IdentificationSource[] = ['ITEM_DEF', 'IMPACT_RATING', 'THREAT_DERIVED', 'CATALOGUE']

interface FormValues {
  name: string
  description: string
  /** Empty while no source is chosen. */
  identification_source: IdentificationSource | ''
  properties: PropertyValues
}

function toValues(asset: Asset): FormValues {
  const properties = Object.fromEntries(
    CIA_PROPERTIES.map(({ value }) => {
      const declared = asset.properties.find((p) => p.property === value)
      return [value, { declared: Boolean(declared), description: declared?.description ?? '' }]
    }),
  ) as PropertyValues
  return { name: asset.name, description: asset.description ?? '', identification_source: asset.identification_source ?? '', properties }
}

function isSame(a: FormValues, b: FormValues) {
  return (
    // The name is saved trimmed, so surrounding spaces alone are no change.
    a.name.trim() === b.name &&
    a.description === b.description &&
    a.identification_source === b.identification_source &&
    CIA_PROPERTIES.every(({ value }) => {
      const x = a.properties[value]
      const y = b.properties[value]
      // The description of a property that is not declared is not saved.
      return x.declared === y.declared && (!x.declared || x.description === y.description)
    })
  )
}

/** Definition tab of an asset ("Asset Definition" wireframe): the fields of the data model and the C / I / A properties, saved together. */
export function AssetDefinitionTab() {
  const { t } = useTranslation()
  const { projectId = '', entityId = '' } = useParams()
  const { data: asset } = useAsset(projectId, entityId)
  const relations = useAssetRelations(projectId, entityId)
  if (!asset) return null
  if (!relations.data) {
    return relations.isError ? (
      <p role="alert" className="text-sm text-destructive">{t('ui:assetPage.propertiesLoadError')}</p>
    ) : (
      <output className="text-sm text-muted-foreground">{t('ui:assetPage.loadingProperties')}</output>
    )
  }
  // Remount on asset change so the form starts from the saved values.
  return <DefinitionForm key={asset.id} projectId={projectId} asset={asset} relations={relations.data} />
}

function DefinitionForm({ projectId, asset, relations }: { projectId: string; asset: Asset; relations: AssetRelations }) {
  const { t } = useTranslation()
  const id = useId()
  const [values, setValues] = useState(() => toValues(asset))
  // Last saved state; kept here so a failed refetch cannot make the form dirty again.
  const [saved, setSaved] = useState(values)
  const [nameError, setNameError] = useState<string>()
  const update = useUpdateAsset(projectId, asset.id)
  const dirty = !isSame(values, saved)

  function change(next: Partial<FormValues>) {
    setValues((prev) => ({ ...prev, ...next }))
    update.reset()
    if ('name' in next) setNameError(undefined)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = values.name.trim()
    if (!name) {
      setNameError(t('ui:nameRequired'))
      return
    }
    update.mutate(
      {
        name,
        description: values.description || null,
        identification_source: values.identification_source || null,
        properties: CIA_PROPERTIES.filter(({ value }) => values.properties[value].declared).map(({ value }) => ({
          property: value,
          description: values.properties[value].description || null,
        })),
      },
      {
        onSuccess: (updated) => {
          setValues(toValues(updated))
          setSaved(toValues(updated))
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid max-w-3xl gap-4">
      <p className="text-xs text-muted-foreground">{t('ui:requiredFields')}</p>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>{t('ui:name')} *</Label>
        <Input
          id={`${id}-name`}
          value={values.name}
          required
          placeholder={t('ui:assetPage.namePlaceholder')}
          onChange={(event) => change({ name: event.target.value })}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? `${id}-name-error` : undefined}
        />
        {nameError && (
          <p id={`${id}-name-error`} role="alert" className="text-sm text-destructive">
            {nameError}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-source`}>{t('ui:assetPage.identificationSource')}</Label>
        <NativeSelect
          id={`${id}-source`}
          value={values.identification_source}
          onChange={(event) => change({ identification_source: event.target.value as FormValues['identification_source'] })}
          className={cn('w-full', !values.identification_source && 'text-muted-foreground')}
        >
          {/* The source is optional (nullable in the data model), so it can be emptied again. */}
          <NativeSelectOption value="">{t('ui:select')}</NativeSelectOption>
          {IDENTIFICATION_SOURCES.map((source) => (
            <NativeSelectOption key={source} value={source}>
              {t(`ui:assetPage.identificationSources.${source}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-description`}>{t('ui:description')}</Label>
        <Textarea
          id={`${id}-description`}
          value={values.description}
          placeholder={t('ui:assetPage.descriptionPlaceholder')}
          onChange={(event) => change({ description: event.target.value })}
        />
      </div>
      <AssetPropertiesField
        idPrefix={id}
        value={values.properties}
        onChange={(property: CiaProperty, value) => change({ properties: { ...values.properties, [property]: value } })}
        relations={relations}
        relationsPath={`${entityPath(projectId, 'assets', asset.id)}/relations`}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || update.isPending}>
          {t('ui:save')}
        </Button>
        <output aria-live="polite" className="text-sm text-muted-foreground">
          {update.isSuccess && !dirty && t('ui:saved')}
        </output>
        {update.isError && (
          <p role="alert" className="text-sm text-destructive">
            {update.error instanceof ApiError && update.error.status === 409
              ? t('ui:assetPage.propertyInUseError')
              : t('ui:assetPage.saveError')}
          </p>
        )}
      </div>
    </form>
  )
}
