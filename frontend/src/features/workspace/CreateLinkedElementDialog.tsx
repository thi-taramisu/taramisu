import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EntityType } from '../../api/models/tree'
import { useItemScenarios, useProjectTree } from '../../api/queries/items'
import { CreateElementDialog } from './CreateElementDialog'
import { entityPath, formatEntityId } from './entities'
import { ItemSelectField } from './ItemSelectField'
import { LinkToField } from './LinkToField'
import { usePageContext } from './usePageContext'

/** What the API returns for the new element. */
interface CreatedEntity {
  id: string
  code: string
  title: string
}

/** Props the "+ New" menu and the Relations tabs pass, the same as for the damage scenario dialog. */
export interface CreateLinkedElementDialogProps<T extends CreatedEntity> {
  projectId: string
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo?: HTMLButtonElement | null
  initialName?: string
  /** Fixes the owning item, e.g. when the new element is linked to an element of that item. */
  lockedItemId?: string
  /** Runs after creating, before the dialog goes on; rejecting keeps the dialog open, and trying again only repeats this step. */
  onCreated?: (created: T) => Promise<unknown>
  /** Shown when `onCreated` rejects. */
  onCreatedError?: (created: T) => string
}

/** Translated texts of the dialog; each type has its own, as the wording depends on the language. */
interface DialogTexts {
  title: string
  description: string
  namePlaceholder: string
  hint: string
  linksLoading: string
  createError: string
  /** The project has no item, so there is nothing to link to. */
  noItem: string
  linksLoadError: string
}

interface Config<T extends CreatedEntity> {
  type: EntityType
  /** Elements the new one is linked to, one level up in the hierarchy. */
  link: {
    type: 'damage-scenarios' | 'threat-scenarios'
    /** Translated singular name, e.g. "Damage Scenario". */
    label: string
  }
  texts: DialogTexts
  create: (itemId: string, title: string, linkIds: string[]) => Promise<T>
}

/**
 * "+ New → …" dialog for elements that hang below other elements (interactive wireframe): name, owning item
 * and the elements one level up. Defaults to the item and, on the page of such an element, to that element.
 * Links are optional: without them the element is created in "Unassigned" of the item.
 */
export function CreateLinkedElementDialog<T extends CreatedEntity>({
  config,
  projectId,
  open,
  onOpenChange,
  returnFocusTo,
  initialName,
  lockedItemId,
  onCreated,
  onCreatedError,
}: CreateLinkedElementDialogProps<T> & { config: Config<T> }) {
  const { t } = useTranslation()
  const { type, link, texts } = config
  const tree = useProjectTree(projectId)
  const items = (tree.data ?? []).filter((node) => node.type === 'items')
  const context = usePageContext(items)
  // Only the user's choices are stored, so defaults that arrive later (the tree loads after opening) still apply.
  const [chosenItemId, setChosenItemId] = useState<string>()
  const [chosenLinkIds, setChosenLinkIds] = useState<string[]>()
  const itemId = lockedItemId ?? chosenItemId ?? context.itemId
  const linkIds = chosenLinkIds ?? (context.type === link.type && context.itemId === itemId ? [context.entityId] : [])
  const [linkError, setLinkError] = useState<string>()
  const itemScenarios = useItemScenarios(projectId, itemId, link.type)
  const candidates = itemScenarios.data
  // Created, but `onCreated` failed; trying again must not create a second one with the same name.
  const [unfinished, setUnfinished] = useState<T>()
  const noItem = tree.isSuccess && items.length === 0
  const loadError = noItem ? texts.noItem : itemScenarios.isError ? texts.linksLoadError : undefined

  const linked = linkIds.flatMap((id) => candidates?.filter((candidate) => candidate.id === id) ?? [])

  /** Undefined goes back to the default links. */
  function changeLinks(next: string[] | undefined) {
    setChosenLinkIds(next)
    setLinkError(undefined)
  }

  async function finish(created: T) {
    try {
      await onCreated?.(created)
    } catch (error) {
      setUnfinished(created)
      throw error
    }
    setUnfinished(undefined)
    return { name: created.title, path: entityPath(projectId, type, created.id) }
  }

  async function create(name: string) {
    if (unfinished) return finish(unfinished)
    if (loadError) {
      setLinkError(loadError)
      return undefined
    }
    // Without links nothing waits for the candidates anymore, but the owning item still has to be known.
    if (!itemId) {
      setLinkError(t('ui:itemsLoading'))
      return undefined
    }
    // The chosen links only count once the candidates are there; creating before would leave it unassigned by accident.
    if (linkIds.length > 0 && !candidates) {
      setLinkError(texts.linksLoading)
      return undefined
    }
    return finish(await config.create(itemId, name, linked.map((element) => element.id)))
  }

  return (
    <CreateElementDialog
      title={texts.title}
      description={texts.description}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      initialName={initialName}
      namePlaceholder={texts.namePlaceholder}
      // Matches the chips once the candidates are there; until then the chosen links say where it will appear.
      hint={(candidates ? linked : linkIds).length > 0 ? texts.hint : t('ui:unassignedHint')}
      errorMessage={
        unfinished
          ? (onCreatedError?.(unfinished) ?? t('ui:createdNextStepError', { code: formatEntityId(unfinished.code) }))
          : texts.createError
      }
      locked={Boolean(unfinished)}
      onCreate={create}
      onReset={() => {
        setUnfinished(undefined)
        setChosenItemId(undefined)
        changeLinks(undefined)
      }}
    >
      <ItemSelectField
        items={items}
        value={itemId}
        locked={Boolean(lockedItemId)}
        onChange={(next) => {
          setChosenItemId(next)
          // Links stay within one item, so they do not carry over.
          changeLinks([])
        }}
      />
      <LinkToField
        elementLabel={link.label}
        linked={linked.map((element) => ({ element }))}
        candidates={candidates?.filter((candidate) => !linkIds.includes(candidate.id)) ?? []}
        onAdd={(element) => changeLinks([...linkIds, element.id])}
        onRemove={(element) => changeLinks(linkIds.filter((id) => id !== element.id))}
        error={linkError ?? loadError}
      />
    </CreateElementDialog>
  )
}
