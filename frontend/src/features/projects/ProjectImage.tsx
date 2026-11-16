import { cn } from '@/lib/utils'
import { generatedProjectImage } from './projectImageSource'

/** Decorative image: the adjacent project title supplies the accessible name. */
export function ProjectImage({ projectId, projectName, image, className }: { projectId: string; projectName: string; image?: string; className?: string }) {
  // This preview accepts local object URLs only. Encode URL characters before
  // using a value originating from the file input in an HTML URL attribute.
  const source = image?.startsWith('blob:')
    ? encodeURI(image)
    : generatedProjectImage(projectId, projectName)

  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-muted', className)}>
      <img src={source} alt="" className="size-full object-cover" />
    </div>
  )
}
