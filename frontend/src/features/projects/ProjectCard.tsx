import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProjectImage } from './ProjectImage'

type ProjectCardProps = {
  projectId: string
  name: string
  description: string
  image?: string
  favorite: boolean
  onToggleFavorite: () => void
}

export function ProjectCard({
  projectId,
  name,
  description,
  image,
  favorite,
  onToggleFavorite,
}: ProjectCardProps) {
  const { t } = useTranslation()
  return (
    <Card className="w-64 overflow-hidden py-0">
      <ProjectImage projectId={projectId} image={image} className="h-32 w-full" />

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
              ? t('ui:removeFavorite', { name: name })
              : t('ui:addFavorite', { name: name })
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
