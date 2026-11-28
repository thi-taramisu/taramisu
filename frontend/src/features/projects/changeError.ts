import { ApiError } from '@/api/errors'
import { isVersionConflict } from '@/api/versions'

/**
 * Translation key of the message for a failed archive, restore, delete or favorite. The backend refuses to
 * delete a project that still has item definitions (409).
 */
export function changeError(error: unknown) {
  if (isVersionConflict(error)) return 'ui:recordVersionConflict'
  if (error instanceof ApiError && error.status === 409) return 'ui:theProjectStillContainsItemDefinitionsSoItCannotBeDeletedYet'
  return 'ui:theChangeCouldNotBeSavedPleaseTryAgain'
}
