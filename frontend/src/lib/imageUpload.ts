/** Image types that image uploads accept. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/**
 * Largest image an upload accepts, in bytes.
 *
 * This check only gives users an early error message. The size limit is set in three places, which must agree:
 * - here, for the message in the browser,
 * - the backend upload handler, which enforces it (does not exist yet),
 * - `client_max_body_size` in proxy/nginx.conf, which limits the whole request and must stay above this.
 * Once the backend exists, it should be the single source of truth and the frontend should read the limit from it.
 */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024

export type ImageError = 'type' | 'size'

export const IMAGE_ERROR_MESSAGES: Record<ImageError, string> = {
  type: 'Only PNG, JPEG and WebP images are supported.',
  size: `Images can be at most ${MAX_IMAGE_SIZE / 1024 / 1024} MB.`,
}

/** Returns why the file can't be uploaded, or null if it can. */
export function validateImage(file: File): ImageError | null {
  // `accept` only filters the file picker, other files can still be chosen.
  if (!IMAGE_TYPES.includes(file.type)) return 'type'
  if (file.size > MAX_IMAGE_SIZE) return 'size'
  return null
}
