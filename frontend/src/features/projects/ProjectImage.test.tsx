import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProjectImage } from './ProjectImage'
import { generatedProjectImage } from './projectImageSource'

const project = { projectId: 'headlamp', projectName: 'Headlamp' }

describe('ProjectImage', () => {
  it('displays a local object URL as a decorative image', () => {
    render(<ProjectImage {...project} image="blob:http://localhost/1234-5678" />)
    expect(screen.getByAltText('')).toHaveAttribute('src', 'blob:http://localhost/1234-5678')
  })

  it.each([
    undefined,
    '',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://example.com/tracker.png',
    '//example.com/tracker.png',
  ])('uses the generated image for a non-object URL: %s', (image) => {
    render(<ProjectImage {...project} image={image} />)
    expect(screen.getByAltText('')).toHaveAttribute('src', generatedProjectImage(project.projectId, project.projectName))
  })

  it('encodes HTML meta-characters in an object URL', () => {
    render(<ProjectImage {...project} image={'blob:http://localhost/<image>"'} />)
    expect(screen.getByAltText('')).toHaveAttribute('src', 'blob:http://localhost/%3Cimage%3E%22')
  })
})

describe('generatedProjectImage', () => {
  it('returns a stable local SVG based on both the project ID and name', () => {
    const image = generatedProjectImage('project-1', 'Battery Security')

    expect(image).toMatch(/^data:image\/svg\+xml[;,]/)
    expect(generatedProjectImage('project-1', 'Battery Security')).toBe(image)
    expect(generatedProjectImage('project-2', 'Battery Security')).not.toBe(image)
    expect(generatedProjectImage('project-1', 'Vehicle Gateway')).not.toBe(image)
  })
})
