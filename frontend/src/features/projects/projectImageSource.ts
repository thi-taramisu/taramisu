import { Avatar, Style } from '@dicebear/core'
import shapes from '@dicebear/styles/shapes.json'

const style = new Style(shapes)

export function generatedProjectImage(projectId: string) {
  return new Avatar(style, {
    seed: projectId,
  }).toDataUri()
}
