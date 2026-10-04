import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from './input.js'

describe('<Input />', () => {
  it('is reachable by its label (label is linked to the input)', () => {
    render(<Input label="Email" type="email" />)
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
  })

  it('gives every input a unique id automatically', () => {
    render(
      <>
        <Input label="First" />
        <Input label="Second" />
      </>,
    )
    expect(screen.getByLabelText('First').id).not.toBe(screen.getByLabelText('Second').id)
  })

  it('describes the input with its hint', () => {
    render(<Input label="Phone" hint="e.g. 01712345678" />)
    expect(screen.getByLabelText('Phone')).toHaveAccessibleDescription('e.g. 01712345678')
  })

  it('marks the input invalid and describes it with the error (error replaces hint)', () => {
    render(<Input label="Phone" hint="e.g. 01712345678" error="Enter a valid number" />)
    const input = screen.getByLabelText('Phone')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter a valid number')
    expect(input).toHaveClass('border-danger')
    expect(screen.queryByText('e.g. 01712345678')).not.toBeInTheDocument()
  })

  it('is not marked invalid without an error', () => {
    render(<Input label="Name" />)
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid')
  })

  it('uses 16px text so phones do not zoom in on focus', () => {
    render(<Input label="Name" />)
    expect(screen.getByLabelText('Name')).toHaveClass('text-base')
  })
})
