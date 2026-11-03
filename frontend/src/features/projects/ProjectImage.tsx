import { FolderKanban } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Decorative image: the adjacent project title supplies the accessible name. */
export function ProjectImage({ image, className }: { image?: string; className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-muted', className)}>
      {image ? (
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        <FolderKanban aria-hidden="true" className="size-1/3 text-muted-foreground" />
      )}
    </div>
  )
}
