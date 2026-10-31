import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { ImageIcon, Upload } from 'lucide-react'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { IMAGE_TYPES } from './headlampSettings'

/** File input for the project image with a local preview; the file is not uploaded yet. */
export function ProjectImageInput({ defaultValue }: { defaultValue: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(defaultValue)
  const [invalidType, setInvalidType] = useState(false)

  // Object URLs keep the file in memory until they are revoked.
  useEffect(() => {
    if (!preview?.startsWith('blob:')) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // `accept` only filters the file picker, other files can still be chosen.
    if (file && !IMAGE_TYPES.includes(file.type)) {
      event.target.value = ''
      setInvalidType(true)
      setPreview(defaultValue)
      return
    }
    setInvalidType(false)
    setPreview(file ? URL.createObjectURL(file) : defaultValue)
  }

  function remove() {
    if (inputRef.current) inputRef.current.value = ''
    setInvalidType(false)
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
        tabIndex={-1}
        className="sr-only"
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload aria-hidden="true" />
          Upload image
        </Button>
        <Button type="button" variant="ghost" disabled={!preview} onClick={remove}>
          Remove
        </Button>
      </div>
      {invalidType && (
        <p role="alert" className="text-sm text-destructive">
          Only PNG, JPEG and WebP images are supported.
        </p>
      )}
    </div>
  )
}
