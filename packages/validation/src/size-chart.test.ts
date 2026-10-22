import { describe, expect, it } from 'vitest'
import {
  convertCell,
  sizeChartInputSchema,
  sizeChartProblems,
  sizeChartSchema,
} from './size-chart.js'

const piece = {
  name: 'Kameez',
  columns: ['Chest', 'Length'],
  rows: [
    { size: 'S', values: ['36', '40'] },
    { size: 'M', values: ['38.5', '41-42'] },
  ],
}

describe('size charts (38f)', () => {
  it('accepts a chart and fills the defaults', () => {
    expect(sizeChartSchema.parse({ pieces: [piece] })).toEqual({
      unit: 'INCH',
      note: null,
      pieces: [piece],
    })
    expect(sizeChartInputSchema.parse({ name: 'Three-piece', pieces: [piece] })).toMatchObject({
      isActive: true,
    })
  })

  it('cells take numbers, ranges or nothing — never words or HTML', () => {
    const withCell = (v: string) =>
      sizeChartSchema.safeParse({
        pieces: [{ ...piece, rows: [{ size: 'S', values: [v, '40'] }] }],
      }).success
    for (const ok of ['', '38', '38.5', '38-40', '38 – 40']) expect(withCell(ok)).toBe(true)
    for (const bad of ['big', '<b>38</b>', '38cm', '-1', '1234']) expect(withCell(bad)).toBe(false)
  })

  it('each row has one value per measurement, and no size twice', () => {
    const r = sizeChartSchema.safeParse({
      pieces: [
        {
          ...piece,
          rows: [
            { size: 'S', values: ['36'] },
            { size: 's', values: ['36', '40'] },
          ],
        },
      ],
    })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(sizeChartProblems(r.error)).toEqual([
        'Piece 1 › row 1: Size S needs 2 values',
        'Piece 1 › row 2: Size s is listed twice',
      ])
  })

  it('limits: 1–4 pieces, at most 8 measurements and 15 sizes', () => {
    expect(sizeChartSchema.safeParse({ pieces: [] }).success).toBe(false)
    expect(sizeChartSchema.safeParse({ pieces: Array(5).fill(piece) }).success).toBe(false)
    const wide = { ...piece, columns: Array(9).fill('X'), rows: [] }
    expect(sizeChartSchema.safeParse({ pieces: [wide] }).success).toBe(false)
  })

  it('converts inch ↔ cm, ranges too, to 1 decimal', () => {
    expect(convertCell('38', 'INCH', 'CM')).toBe('96.5')
    expect(convertCell('38-40', 'INCH', 'CM')).toBe('96.5-101.6')
    expect(convertCell('100', 'CM', 'INCH')).toBe('39.4')
    expect(convertCell('38', 'INCH', 'INCH')).toBe('38')
    expect(convertCell('', 'INCH', 'CM')).toBe('')
  })
})
