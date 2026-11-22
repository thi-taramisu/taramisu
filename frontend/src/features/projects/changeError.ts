import { ApiError } from '@/api/errors'

/** Message for a failed archive, restore, delete or favorite. The backend refuses to delete a project that still has items (409). */
export function changeError(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return 'The project still contains item definitions, so it cannot be deleted yet.'
  return 'The change could not be saved. Please try again.'
}
