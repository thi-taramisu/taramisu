// Attack paths as far as the relation views need them, following `ATTACK_PATH` of the data model. Not in the backend spec yet.

export interface AttackPath {
  id: string
  item_definition_id: string
  /** Display ID such as AP-01; not in the DB schema yet (as for assets). */
  code: string
  title: string
}
