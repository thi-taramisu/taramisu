import { FolderKanban, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

type ProjectCardProps = {
  name: string
  description: string
  favorite: boolean
}

export function ProjectCard({ name, description, favorite }: ProjectCardProps) {
  return (
    <Card className="w-64 overflow-hidden py-0">
      <div className="flex h-32 items-center justify-center bg-muted">
        <FolderKanban className="size-12 text-muted-foreground" />
      </div>
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Star
          className="size-5 shrink-0"
          fill={favorite ? 'currentColor' : 'none'}
          aria-label={favorite ? 'Favorite project' : 'Not a favorite'}
        />
      </CardContent>
    </Card>
  )
}
