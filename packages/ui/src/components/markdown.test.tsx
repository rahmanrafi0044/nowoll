import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './markdown.js'

describe('Markdown', () => {
  it('headings, lists, bold, tables (GFM)', () => {
    const { container } = render(
      <Markdown>
        {
          '# Returns\n\nWithin **7 days**.\n\n- Unworn\n- Tags on\n\n| Size | Chest |\n|---|---|\n| M | 40 |'
        }
      </Markdown>,
    )
    expect(screen.getByRole('heading', { name: 'Returns' })).toBeInTheDocument()
    expect(container.querySelector('strong')).toHaveTextContent('7 days')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('table')).toHaveTextContent('M40')
  })

  it('pasted HTML is never run or rendered', () => {
    const { container } = render(
      <Markdown>
        {'Hello <script>alert(1)</script> <img src=x onerror="alert(1)"> <b>bold</b>'}
      </Markdown>,
    )
    expect(container.querySelector('script, img, b, [onerror]')).toBeNull()
    expect(container).toHaveTextContent('Hello')
    expect(container.textContent).not.toMatch(/[<>]/) // tags dropped, not shown as text
  })

  it('links: shop paths, https (new tab), email, phone kept; javascript: and http: dropped, words kept', () => {
    render(
      <Markdown>
        {
          '[Shop](/shop/men) [WhatsApp](https://wa.me/880) [Email](mailto:hi@nowoll.com) [Call](tel:+880) [Bad](javascript:alert(1)) [Old](http://x.com)'
        }
      </Markdown>,
    )
    expect(screen.getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop/men')
    expect(screen.getByRole('link', { name: 'Shop' })).not.toHaveAttribute('target')
    const wa = screen.getByRole('link', { name: 'WhatsApp' })
    expect(wa).toHaveAttribute('target', '_blank')
    expect(wa).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Email' })).toHaveAttribute(
      'href',
      'mailto:hi@nowoll.com',
    )
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+880')
    expect(screen.queryByRole('link', { name: 'Bad' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Old' })).toBeNull()
    expect(screen.getByText('Bad')).toBeInTheDocument()
  })

  it('no pictures inside pages (the description stays as text)', () => {
    const { container } = render(
      <Markdown>{'![Model in a panjabi](https://x.com/a.jpg)'}</Markdown>,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('Model in a panjabi')
  })

  it('a page’s # heading becomes the second level (the page title is the one h1)', () => {
    render(<Markdown>{'# Section'}</Markdown>)
    expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeInTheDocument()
  })

  it('photos (step 43): only when the page passes `photo`, which decides; otherwise the description', () => {
    const md =
      'Look:\n\n![Two panjabis](https://own.example/a.jpg#w=10&h=10)\n\n![Bad](https://evil.example/b.jpg)'
    const { container } = render(
      <Markdown
        photo={({ src, alt }) =>
          src.startsWith('https://own.example/') ? (
            <img src={src} alt={alt} data-testid="photo" />
          ) : null
        }
      >
        {md}
      </Markdown>,
    )
    expect(screen.getAllByTestId('photo')).toHaveLength(1)
    expect(screen.getByAltText('Two panjabis')).toHaveAttribute(
      'src',
      'https://own.example/a.jpg#w=10&h=10',
    )
    expect(screen.getByText('Bad')).toBeInTheDocument() // refused → its words only
    expect(container.querySelector('p img, p div')).toBeNull() // a lone photo isn't wrapped in <p>
  })
})
