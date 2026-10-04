import { describe, expect, it } from 'vitest'
import { cn } from './cn.js'

describe('cn', () => {
  it('joins classes and skips falsy values', () => {
    const isActive = false
    expect(cn('px-4', isActive && 'font-bold', undefined, null, 'mt-2')).toBe('px-4 mt-2')
  })
})
