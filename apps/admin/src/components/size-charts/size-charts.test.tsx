import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AdminSizeChart } from '@nowoll/types'
import * as api from '@/lib/size-charts-api'
import { changesOf } from '@/components/product-edit/details-form'
import { SizeChartForm } from './size-chart-form'
import { SizeChartList } from './size-chart-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/size-charts',
}))
vi.mock('@/lib/size-charts-api', () => ({
  fetchSizeCharts: vi.fn(),
  fetchSizeChart: vi.fn(),
  createSizeChart: vi.fn(),
  updateSizeChart: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const saved: AdminSizeChart = {
  id: 'c1',
  name: 'Three-piece — regular',
  unit: 'INCH',
  note: null,
  pieces: [{ name: 'Kameez', columns: ['Chest'], rows: [{ size: 'M', values: ['38'] }] }],
  isActive: true,
  productCount: 2,
  categoryCount: 1,
  updatedAt: '2026-10-22T08:00:00Z',
}

beforeEach(() => vi.resetAllMocks())

describe('Admin → Size charts (38f)', () => {
  it('lists charts with what they are used by', async () => {
    mocked.fetchSizeCharts.mockResolvedValue(
      ok([
        saved,
        { ...saved, id: 'c2', name: 'Kurti', isActive: false, productCount: 0, categoryCount: 0 },
      ]),
    )
    render(<SizeChartList />)
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Three-piece — regular')
    expect(items[0]).toHaveTextContent('1 category, 2 products')
    expect(items[1]).toHaveTextContent('Not used yet')
    expect(items[1]).toHaveTextContent('Off')
  })

  it('new chart: lists problems before sending anything, then creates it', async () => {
    mocked.createSizeChart.mockResolvedValue(ok(saved))
    render(<SizeChartForm chart={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create chart' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Name the chart')
    expect(mocked.createSizeChart).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Name (only you see it)'), {
      target: { value: 'Kurti — regular' },
    })
    fireEvent.change(screen.getByLabelText('Piece 1 name'), { target: { value: 'Kurti' } })
    fireEvent.change(screen.getByLabelText('Kurti, M, Chest'), { target: { value: 'big' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create chart' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Piece 1 › row 2: Numbers only, e.g. 38, 38.5 or 38-40',
    )

    fireEvent.change(screen.getByLabelText('Kurti, M, Chest'), { target: { value: '38' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create chart' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/size-charts'))
    const sent = mocked.createSizeChart.mock.calls[0]![0]
    expect(sent).toMatchObject({ name: 'Kurti — regular', unit: 'INCH', isActive: true })
    expect(sent.pieces[0]!.rows[1]).toEqual({ size: 'M', values: ['38', ''] })
  })

  it('adding and removing a measurement keeps every size row lined up', () => {
    render(<SizeChartForm chart={saved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a measurement to Kameez' }))
    fireEvent.change(screen.getByLabelText('Kameez measurement 2'), {
      target: { value: 'Length' },
    })
    fireEvent.change(screen.getByLabelText('Kameez, M, Length'), { target: { value: '41' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Chest' }))
    expect(screen.getByLabelText('Kameez, M, Length')).toHaveValue('41')
    expect(screen.queryByLabelText('Kameez, M, Chest')).toBeNull()
  })

  it('the three-piece start gives a kameez and a salwar table', () => {
    render(<SizeChartForm chart={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Three-piece (kameez + salwar)' }))
    expect(screen.getByLabelText('Piece 1 name')).toHaveValue('Kameez')
    expect(screen.getByLabelText('Piece 2 name')).toHaveValue('Salwar')
    expect(
      within(screen.getAllByRole('group')[1]!).getByLabelText('Salwar, XL, Hip'),
    ).toBeInTheDocument()
  })

  it('editing: saves in place and says so', async () => {
    mocked.updateSizeChart.mockResolvedValue(ok(saved))
    render(<SizeChartForm chart={saved} />)
    expect(screen.getByText('Used by 1 category and 2 products.')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Show this chart on the shop'))
    fireEvent.click(screen.getByRole('button', { name: 'Save chart' }))
    await waitFor(() =>
      expect(mocked.updateSizeChart).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ isActive: false }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  })

  it('product form: choosing a chart sends its id; "the category’s" sends null', () => {
    const base = {
      name: 'A',
      slug: 'a',
      categoryId: 'c',
      basePrice: '1000',
      compareAtPrice: '',
      shortDescription: '',
      description: '',
      tags: '',
      isFeatured: false,
      seoTitle: '',
      seoDescription: '',
      fabric: '',
      care: '',
      fitNote: '',
      readyToShip: false,
      sizeChartId: '',
    }
    expect(changesOf(base, { ...base, sizeChartId: 'c1' })).toEqual({
      changes: { sizeChartId: 'c1' },
    })
    expect(changesOf({ ...base, sizeChartId: 'c1' }, base)).toEqual({
      changes: { sizeChartId: null },
    })
  })
})
