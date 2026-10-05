import { render, screen } from '@testing-library/react'
import { AnnouncementBar } from './announcement-bar'
import { CategoryGrid } from './category-grid'
import { Hero } from './hero'
import { ProductSection } from './product-section'

const hero = {
  heading: 'always new',
  subheading: 'Everyday clothing',
  ctaLabel: 'Shop now',
  ctaHref: '/shop',
  imageUrl: null,
  imageAlt: null,
}

describe('<Hero />', () => {
  it('shows the heading as the page h1 and the button link', () => {
    render(<Hero data={hero} />)
    expect(screen.getByRole('heading', { level: 1, name: 'always new' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '/shop')
  })

  it('shows the photo with its alt text when there is one', () => {
    render(
      <Hero
        data={{ ...hero, imageUrl: 'https://x.supabase.co/h.jpg', imageAlt: 'Model in a kurti' }}
      />,
    )
    expect(screen.getByRole('img', { name: 'Model in a kurti' })).toBeInTheDocument()
  })
})

describe('<AnnouncementBar />', () => {
  it('links when a link is set, plain text otherwise', () => {
    const { rerender } = render(<AnnouncementBar data={{ text: 'Free delivery', href: '/shop' }} />)
    expect(screen.getByRole('link', { name: 'Free delivery' })).toHaveAttribute('href', '/shop')
    rerender(<AnnouncementBar data={{ text: 'Free delivery', href: null }} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('<CategoryGrid /> and <ProductSection />', () => {
  it('render nothing when there is nothing to show', () => {
    const { container } = render(
      <>
        <CategoryGrid categories={[]} />
        <ProductSection id="f" title="Featured" products={[]} viewAllHref="/shop" />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('links each category tile to its listing page', () => {
    render(
      <CategoryGrid
        categories={[
          {
            id: '1',
            name: 'Men',
            slug: 'men',
            description: null,
            imageUrl: null,
            imageAlt: null,
            seoTitle: null,
            seoDescription: null,
            children: [],
          },
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Men' })).toHaveAttribute('href', '/shop/men')
  })
})
