import { Avatar, Style } from '@dicebear/core'
import shapes from '@dicebear/styles/shapes.json'

const style = new Style(shapes)

export function generatedProjectImage(projectId: string, projectName: string) {
  return new Avatar(style, {
    seed: JSON.stringify([projectId, projectName.trim()]),
  }).toDataUri()
}
