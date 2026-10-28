
import { FolderKanban, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type ProjectCardProps = {
  name: string
  description: string
  favorite: boolean
  onToggleFavorite: () => void
}

export function ProjectCard({
  name,
  description,
  favorite,
  onToggleFavorite,
}: ProjectCardProps) {
  return (
    <Card className="w-64 overflow-hidden py-0">
      <div className="flex h-32 items-center justify-center bg-muted">
        <FolderKanban className="size-12 text-muted-foreground" />
      </div>

      <CardContent className="flex items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleFavorite}
          aria-label={
            favorite
              ? `Remove ${name} from favorites`
              : `Add ${name} to favorites`
          }
          aria-pressed={favorite}
        >
          <Star
            className="size-5"
            fill={favorite ? 'currentColor' : 'none'}
          />
        </Button>
      </CardContent>
    </Card>
  )
}
