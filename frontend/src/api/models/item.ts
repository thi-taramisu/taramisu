// Item definition as the item views use it. Hand-written from the `ItemDefinition` schema of the item
// CRUD routes (#83, PR #138); once they are in `backend/openapi.json`, derive these types from
// `components['schemas']` in `../schema.d.ts` instead.

export type ScopeType = 'ITEM' | 'COMPONENT'

export interface ItemDefinition {
  id: string
  tara_project_id: string
  name: string
  scope_type: ScopeType
  lifecycle_phase: string | null
  item_definition_wp_09_01: string | null
  cybersecurity_specs_wp_10_01: string | null
  architectural_design: string | null
  // Fields of the Definition tab in the interactive wireframe; not in the DB schema yet, the
  // schema follows the UI here (see #94).
  boundary: string | null
  functions: string | null
  operational_environment: string | null
  created_at: string
}

type EditableFields = Omit<ItemDefinition, 'id' | 'tara_project_id' | 'created_at'>

/** POST body: name and scope type are required, everything else is optional. */
export type ItemDefinitionBody = Pick<EditableFields, 'name' | 'scope_type'> & Partial<EditableFields>

/** PATCH body: only the given fields change. */
export type PatchItemDefinitionBody = Partial<EditableFields>

export const ITEM_NAME_MAX_LENGTH = 255
