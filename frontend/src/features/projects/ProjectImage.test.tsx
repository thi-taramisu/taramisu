import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProjectImage } from './ProjectImage'

describe('ProjectImage', () => {
  it('displays a local object URL as a decorative image', () => {
    render(<ProjectImage image="blob:http://localhost/1234-5678" />)
    expect(screen.getByAltText('')).toHaveAttribute('src', 'blob:http://localhost/1234-5678')
  })

  it.each([
    undefined,
    '',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://example.com/tracker.png',
    '//example.com/tracker.png',
  ])('does not render an image for a non-object URL: %s', (image) => {
    render(<ProjectImage image={image} />)
    expect(screen.queryByAltText('')).not.toBeInTheDocument()
  })

  it('encodes HTML meta-characters in an object URL', () => {
    render(<ProjectImage image={'blob:http://localhost/<image>"'} />)
    expect(screen.getByAltText('')).toHaveAttribute('src', 'blob:http://localhost/%3Cimage%3E%22')
  })
})
