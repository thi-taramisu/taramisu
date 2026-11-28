import { ApiError } from '@/api/errors'

/**
 * Translation key of the message for a failed archive, restore, delete or favorite. The backend refuses to
 * delete a project that still has item definitions (409).
 */
export function changeError(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return 'ui:theProjectStillContainsItemDefinitionsSoItCannotBeDeletedYet'
  return 'ui:theChangeCouldNotBeSavedPleaseTryAgain'
}
