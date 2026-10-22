import { fireEvent, render, screen, within } from '@testing-library/react'
import { SizeChart } from './size-chart'

const chart = {
  unit: 'INCH' as const,
  note: null,
  pieces: [
    {
      name: 'Kameez',
      columns: ['Chest', 'Length'],
      rows: [{ size: 'M', values: ['38', '40-41'] }],
    },
  ],
}

describe('<SizeChart /> (38f)', () => {
  it('a real table: sizes and measurements are header cells', () => {
    render(<SizeChart chart={chart} />)
    const table = screen.getByRole('table', { name: 'Kameez' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Size', 'Chest', 'Length'])
    expect(within(table).getByRole('rowheader', { name: 'M' })).toBeInTheDocument()
    expect(
      within(table)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['38', '40-41'])
  })

  it('switches to cm and back', () => {
    render(<SizeChart chart={chart} />)
    expect(screen.getByRole('button', { name: 'Inches' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'cm' }))
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual(['96.5', '101.6-104.1'])
    expect(screen.getByText('Measurements in cm')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inches' }))
    expect(screen.getAllByRole('cell')[0]).toHaveTextContent('38')
  })
})
