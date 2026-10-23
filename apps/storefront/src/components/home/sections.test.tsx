import { fireEvent, render, screen } from '@testing-library/react'
import { AnnouncementBar } from './announcement-bar'
import { BrandStory } from './brand-story'
import { CategoryGrid } from './category-grid'
import { CircleLinks } from './circle-links'
import { LookbookSection } from './lookbook'
import { Hero } from './hero'
import { ProductSection } from './product-section'
import { SplitBanner } from './split-banner'

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

  it('38f: one slide = no slide controls', () => {
    render(<Hero data={{ ...hero, more: [] }} />)
    expect(screen.queryByRole('button', { name: /pause slides/i })).not.toBeInTheDocument()
  })

  it('38f: extra slides take turns — dots switch slides, the pause button pauses', () => {
    render(
      <Hero
        data={{
          ...hero,
          more: [{ ...hero, heading: 'Eid edit', ctaLabel: 'See Eid', ctaHref: '/shop/eid' }],
        }}
      />,
    )
    // One <h1> only; the second slide's heading is an <h2>, hidden until shown.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'See Eid' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show slide 2: Eid edit' }))
    expect(screen.getByRole('link', { name: 'See Eid' })).toHaveAttribute('href', '/shop/eid')
    expect(screen.queryByRole('link', { name: 'Shop now' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pause slides' }))
    expect(screen.getByRole('button', { name: 'Play slides' })).toBeInTheDocument()
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

describe('38f sections: split banner, circles, brand story', () => {
  const base = { visible: true }

  it('split banner: heading, words, button link and photo', () => {
    render(
      <SplitBanner
        section={{
          ...base,
          id: 'sp',
          type: 'split',
          imageUrl: '/perf/a.jpg',
          imageAlt: 'Lawn three-piece',
          heading: 'Made for summer',
          text: 'Light lawn.',
          ctaLabel: 'Shop lawn',
          href: '/shop/lawn',
          imageSide: 'right',
        }}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Made for summer' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Lawn three-piece' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shop lawn' })).toHaveAttribute('href', '/shop/lawn')
  })

  it('split banner without a button label shows no link', () => {
    render(
      <SplitBanner
        section={{
          ...base,
          id: 'sp',
          type: 'split',
          imageUrl: '/perf/a.jpg',
          imageAlt: 'A',
          heading: 'H',
          text: null,
          ctaLabel: null,
          href: '/shop',
          imageSide: 'left',
        }}
      />,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('circles: one named link per circle', () => {
    render(
      <CircleLinks
        section={{
          ...base,
          id: 'c',
          type: 'circles',
          title: 'Shop by occasion',
          items: [
            { imageUrl: '/a.jpg', imageAlt: 'Eid outfit', label: 'Eid', href: '/shop/eid' },
            { imageUrl: '/b.jpg', imageAlt: 'Office kurti', label: 'Office', href: '/shop/office' },
          ],
        }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Shop by occasion' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Eid/ })).toHaveAttribute('href', '/shop/eid')
    expect(screen.getByRole('link', { name: /Office/ })).toHaveAttribute('href', '/shop/office')
  })

  it('brand story: words without a photo', () => {
    render(
      <BrandStory
        section={{
          ...base,
          id: 'st',
          type: 'story',
          heading: 'Always new',
          text: 'Made in Dhaka.',
          imageUrl: null,
          imageAlt: null,
          ctaLabel: null,
          href: null,
        }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Always new' })).toBeInTheDocument()
    expect(screen.getByText('Made in Dhaka.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('38f lookbook ("Spotted")', () => {
  const shot = (n: number, href: string | null, caption: string | null) => ({
    imageUrl: `/perf/look-${n}.jpg`,
    imageAlt: `Customer ${n} in a kurti`,
    caption,
    href,
  })

  it('a photo with a link is a link (named by its photo and caption); without, a captioned figure', () => {
    render(
      <LookbookSection
        section={{
          id: 'look',
          visible: true,
          type: 'lookbook',
          title: null,
          text: 'Tag us to be featured.',
          items: [
            shot(1, '/products/mehr', '@nusrat in Mehr'),
            shot(2, null, '@rima at Eid'),
            shot(3, null, null),
          ],
        }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Spotted in Nowoll' })).toBeInTheDocument()
    expect(screen.getByText('Tag us to be featured.')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /@nusrat in Mehr/ })).toHaveAttribute(
      'href',
      '/products/mehr',
    )
    expect(screen.getAllByRole('figure')[0]).toHaveTextContent('@rima at Eid')
    expect(screen.getAllByRole('img')).toHaveLength(3)
  })
})
