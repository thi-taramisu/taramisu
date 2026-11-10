import { Link } from 'react-router-dom'
import type { EntityRef, EntityType } from '../../api/models/tree'
import { entityPath } from '../workspace/entities'

/** Code and name of an element as a link, optionally to one of its tabs. */
export function EntityLink({ projectId, type, entity, tab = '' }: { projectId: string; type: EntityType; entity: EntityRef; tab?: string }) {
  return (
    <Link to={`${entityPath(projectId, type, entity.id)}${tab && `/${tab}`}`} className="hover:underline">
      <span className="font-mono text-xs text-muted-foreground">{entity.code}</span> {entity.name}
    </Link>
  )
}
