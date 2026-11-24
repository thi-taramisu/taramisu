import type { components } from '../schema'

// Item definitions as `/projects/{project_id}/item-definitions` returns and takes them. The backend leaves
// out optional fields that are empty, so they can be missing as well as null.

type Schemas = components['schemas']

export type ItemDefinition = Schemas['ItemDefinition']

export type ScopeType = ItemDefinition['scope_type']

/** POST body: name and scope type are required, everything else is optional. */
export type ItemDefinitionBody = Schemas['ItemDefinitionBody']

/** PATCH body: only the given fields change, null clears a field. */
export type PatchItemDefinitionBody = Schemas['PatchItemDefinitionBody']

export const ITEM_NAME_MAX_LENGTH = 255
