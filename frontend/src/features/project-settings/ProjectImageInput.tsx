import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { ImageIcon, Upload } from 'lucide-react'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { IMAGE_ERROR_MESSAGES, IMAGE_TYPES, type ImageError, validateImage } from '@/lib/imageUpload'

/** File input for the project image with a local preview; the file is not uploaded yet. */
export function ProjectImageInput({ defaultValue }: { defaultValue: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(defaultValue)
  const [removed, setRemoved] = useState(false)
  const [error, setError] = useState<ImageError | null>(null)
  // Without a chosen file, the preview shows the saved image unless it was removed.
  const fallback = removed ? null : defaultValue

  // Object URLs keep the file in memory until they are revoked.
  useEffect(() => {
    if (!preview?.startsWith('blob:')) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const fileError = file ? validateImage(file) : null
    setError(fileError)
    // Invalid files are cleared, so the preview always matches what the form submits.
    if (!file || fileError) {
      event.target.value = ''
      setPreview(fallback)
      return
    }
    setPreview(URL.createObjectURL(file))
  }

  function remove() {
    if (inputRef.current) inputRef.current.value = ''
    setError(null)
    setRemoved(true)
    setPreview(null)
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="project-image">Image</Label>
      <div className="w-full max-w-md">
        <AspectRatio ratio={3 / 1} className="flex items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {preview ? (
            <img src={preview} alt="Preview" className="size-full object-cover" />
          ) : (
            <ImageIcon aria-hidden="true" className="size-8 text-muted-foreground" />
          )}
        </AspectRatio>
      </div>
      {/* The native file input shows its own text in the browser language, so our buttons replace it. */}
      <input
        ref={inputRef}
        id="project-image"
        name="image"
        type="file"
        accept={IMAGE_TYPES.join(',')}
        onChange={handleChange}
        aria-invalid={error !== null}
        aria-describedby={error ? 'project-image-error' : undefined}
        tabIndex={-1}
        className="sr-only"
      />
      {/* An empty file input also means "unchanged", so removing the saved image needs its own field. */}
      {removed && !preview && <input type="hidden" name="removeImage" value="true" />}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload aria-hidden="true" />
          Upload image
        </Button>
        <Button type="button" variant="ghost" disabled={!preview} onClick={remove}>
          Remove
        </Button>
      </div>
      {error && (
        <p id="project-image-error" role="alert" className="text-sm text-destructive">
          {IMAGE_ERROR_MESSAGES[error]}
        </p>
      )}
    </div>
  )
}
