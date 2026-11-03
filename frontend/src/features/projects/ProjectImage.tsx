import { FolderKanban } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Decorative image: the adjacent project title supplies the accessible name. */
export function ProjectImage({ image, className }: { image?: string; className?: string }) {
  // This preview accepts local object URLs only. Encode URL characters before
  // using a value originating from the file input in an HTML URL attribute.
  const source = image?.startsWith('blob:') ? encodeURI(image) : undefined

  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-muted', className)}>
      {source ? (
        <img src={source} alt="" className="size-full object-cover" />
      ) : (
        <FolderKanban aria-hidden="true" className="size-1/3 text-muted-foreground" />
      )}
    </div>
  )
}
