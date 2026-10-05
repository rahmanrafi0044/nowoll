import { render, screen } from '@testing-library/react'
import { Pagination, pageItems } from './pagination'

describe('pageItems', () => {
  it.each([
    [1, 1, [1]],
    [1, 5, [1, 2, '…', 5]],
    [5, 10, [1, '…', 4, 5, 6, '…', 10]],
    [10, 10, [1, '…', 9, 10]],
    [2, 3, [1, 2, 3]],
  ])('page %i of %i → %j', (current, total, expected) => {
    expect(pageItems(current, total)).toEqual(expected)
  })
})

describe('<Pagination />', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} hrefFor={(p) => `/shop?page=${p}`} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('marks the current page and links previous/next', () => {
    render(<Pagination page={2} totalPages={3} hrefFor={(p) => `/shop?page=${p}`} />)
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/shop?page=1',
    )
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/shop?page=3')
  })
})
