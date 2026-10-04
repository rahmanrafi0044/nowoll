import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './badge.js'

describe('<Badge />', () => {
  it('renders neutral by default', () => {
    render(<Badge>Draft</Badge>)
    expect(screen.getByText('Draft')).toHaveClass('bg-surface-muted')
  })

  it.each([
    ['success', 'text-success'],
    ['warning', 'text-warning'],
    ['danger', 'text-danger'],
    ['info', 'text-info'],
  ] as const)('applies the %s variant', (variant, expected) => {
    render(<Badge variant={variant}>Status</Badge>)
    expect(screen.getByText('Status')).toHaveClass(expected)
  })
})
